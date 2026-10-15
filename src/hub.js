// -----------------------------------------------------------------------------
// The Mill hub: reads the Mill cloud and the local heaters, publishes the
// devices and their states, runs the commands.
//
// Refresh. The core does not poll external devices reliably (Gladys#3198, not
// fixed in 5.2.1): the hub refreshes by itself, with two timers.
//   - cloud: one read of the whole account (2 requests per house) every
//     refresh interval of the configuration (1 minute by default);
//   - local: GET /control-status on each Gen 3 heater every 30 s.
// The core's onPoll stays as a fallback: it refreshes a source only when its
// timer has not done it for 90 % of a period. After the first discovery, only
// the devices added to Gladys are read (Gladys drops the states of the others).
//
// Cloud manners. A refused account stops the cloud reads until the
// configuration changes (signing in again and again could lock the account).
// A 429 doubles the interval, up to 30 minutes, until a read succeeds.
//
// Commands. The state a command sets is published at once and held for
// 30 s: the cloud reports a change late, a read in between would show the old
// value for a minute.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { LOCAL_INTERVAL_S, hasCloud, isConfigured } from './config.js';
import { THERMOSTAT_MODE } from './constants.js';
import {
  FEATURES,
  SUPPORTED_MODES,
  TARGET_MAX,
  TARGET_MIN,
  buildDevice,
  idsOf,
  statesOf,
} from './devices.js';
import { EnergyCounter } from './energy.js';
import { MESSAGES } from './i18n.js';
import { createIssueLog } from './issues.js';
import { MillCloud } from './mill/cloud.js';
import { MillLocal } from './mill/local.js';
import { CLOUD_MODE_OF, LOCAL_MODE_OF, fromCloud, fromLocal, isThermostat } from './model.js';

const logger = createLogger({ name: 'mill' });

export const WIDGET_KEY = 'overview';
export const TRIGGER_OFFLINE = 'device_offline';

// A value that does not change is published again every 6 hours, so Gladys
// never shows "no recent value" (it does past 48 h).
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
const HOLD_MS = 30 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
// A local address that never answered is tried again every 5 minutes.
const LOCAL_DISCOVERY_RETRY_MS = 5 * 60 * 1000;

const DEFAULT_TIMINGS = {
  cloudMs: null, // from the configuration
  localMs: LOCAL_INTERVAL_S * 1000,
};

/** The feature key of a feature external id (`<device external id>:<key>`). */
const featureKeyOf = (device, feature) =>
  feature.external_id.startsWith(`${device.external_id}:`)
    ? feature.external_id.slice(device.external_id.length + 1)
    : undefined;

export class MillHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {import('./store.js').Store} options.store
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] run the refresh timers
   * @param {object} [options.timings] { cloudMs, localMs } overrides (tests)
   */
  constructor({
    gladys,
    store,
    fetch = globalThis.fetch,
    now = () => Date.now(),
    timers = true,
    timings = {},
  }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetch;
    this.now = now;
    this.timersEnabled = timers;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.cloud = null;
    this.locals = new Map();
    /** Snapshots by device external id. */
    this.snapshots = new Map();
    this.holds = new Map();
    this.transports = new Map();
    /** Last known connection of each device (offline trigger). */
    this.up = new Map();
    this.cloudState = 'off';
    this.cloudBackoff = 1;
    this.lastRead = { cloud: 0, local: 0 };
    this.inFlight = { cloud: null, local: null };
    this.timers = { cloud: null, local: null };
    this.statusKey = null;
    this.energy = null;
    this.stopped = false;
  }

  // --- lifecycle -------------------------------------------------------------

  /** First connection: read everything, publish the devices, start the timers. */
  async start(config) {
    await this.store.load();
    this.energy = new EnergyCounter(this.store, this.now);
    await this.apply(config);
  }

  /** New configuration: new clients, everything read again. */
  async reconfigure(config) {
    logger.info('Configuration updated');
    await this.apply(config);
  }

  /** Reconnection to Gladys: it may have restarted, send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.statusKey = null;
    await this.apply(config);
  }

  async apply(config) {
    this.stopTimers();
    this.stopped = false;
    const cloudChanged =
      !this.config ||
      config.username !== this.config.username ||
      config.password !== this.config.password;
    this.config = config;
    if (cloudChanged) {
      this.cloud = hasCloud(config)
        ? new MillCloud({
            username: config.username,
            password: config.password,
            store: this.store,
            fetch: this.fetch,
            now: this.now,
          })
        : null;
      this.cloudState = this.cloud ? 'pending' : 'off';
      for (const key of [...this.snapshots.keys()]) {
        if (this.snapshots.get(key).source === 'cloud') {
          this.snapshots.delete(key);
        }
      }
    } else if (this.cloud && this.cloudState === 'auth') {
      // Same account, but the user saved the form again: one more try.
      this.cloudState = 'pending';
    }
    this.cloudBackoff = 1;

    const previous = this.locals;
    this.locals = new Map();
    for (const host of config.hosts) {
      this.locals.set(
        host,
        previous.get(host) ?? {
          client: new MillLocal(host, { fetch: this.fetch }),
          identity: null,
          triedAt: 0,
        },
      );
    }
    for (const [key, snapshot] of [...this.snapshots]) {
      if (snapshot.source === 'local' && !this.locals.has(snapshot.host)) {
        this.snapshots.delete(key);
      }
    }

    if (config.invalidHosts.length > 0) {
      logger.warn(
        `Ignored local addresses (not an IP address or a host name): ${config.invalidHosts.length}`,
      );
    }
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for a Mill account or a local address');
    }

    await this.refreshAll({ discovery: true });
    await this.publishDiscovery();
    this.scheduleAll();
  }

  stopTimers() {
    for (const source of ['cloud', 'local']) {
      clearTimeout(this.timers[source]);
      this.timers[source] = null;
    }
  }

  async stop() {
    this.stopped = true;
    this.stopTimers();
    await this.energy?.save().catch(() => {});
    await this.store.flush();
  }

  // --- timers ----------------------------------------------------------------

  periodMs(source) {
    if (source === 'local') {
      return this.timings.localMs;
    }
    const base = this.timings.cloudMs ?? this.config.refreshIntervalS * 1000;
    return Math.min(base * this.cloudBackoff, Math.max(base, MAX_BACKOFF_MS));
  }

  scheduleAll() {
    this.schedule('cloud');
    this.schedule('local');
  }

  schedule(source) {
    clearTimeout(this.timers[source]);
    this.timers[source] = null;
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.timers[source] = setTimeout(async () => {
      this.timers[source] = null;
      try {
        await this.refresh(source, { minGap: 0.5 });
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        this.schedule(source);
      }
    }, this.periodMs(source));
    this.timers[source].unref?.();
  }

  /**
   * The core's onPoll (fallback): refresh the source of the device unless its
   * timer just did.
   */
  async poll(device) {
    const snapshot = this.snapshots.get(device.external_id);
    if (!snapshot) {
      logger.debug(`onPoll ignored for an unknown device`);
      return;
    }
    await this.refresh(snapshot.source, { minGap: 0.9 });
  }

  // --- reading ---------------------------------------------------------------

  async refreshAll(options = {}) {
    await Promise.all([this.refresh('cloud', options), this.refresh('local', options)]);
  }

  /**
   * Read one source and publish what changed. Shared by the timer, onPoll and
   * the commands; a second caller waits for the read in progress.
   * @param {'cloud'|'local'} source
   * @param {{ discovery?: boolean, minGap?: number }} [options]
   */
  async refresh(source, { discovery = false, minGap = 0 } = {}) {
    if (this.inFlight[source]) {
      return this.inFlight[source];
    }
    if (minGap > 0 && this.now() - this.lastRead[source] < this.periodMs(source) * minGap) {
      return undefined;
    }
    const run = (async () => {
      try {
        if (source === 'cloud') {
          await this.readCloud(discovery);
        } else {
          await this.readLocal(discovery);
        }
        this.lastRead[source] = this.now();
        await this.publishStates();
        await this.publishTransports();
        await this.reportStatus();
      } finally {
        this.inFlight[source] = null;
      }
    })();
    this.inFlight[source] = run;
    return run;
  }

  createdIds() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  hasCreated(source) {
    const created = this.createdIds();
    return [...this.snapshots.values()].some(
      (snapshot) => snapshot.source === source && created.has(idsOf(this.gladys, snapshot).device),
    );
  }

  async readCloud(discovery) {
    if (!this.cloud || this.cloudState === 'auth') {
      return;
    }
    // Nothing added from the cloud yet: only the discovery reads it.
    if (!discovery && this.cloudState === 'ok' && !this.hasCreated('cloud')) {
      logger.debug('No cloud device added to Gladys: cloud read skipped');
      return;
    }
    let entries;
    try {
      entries = await this.cloud.listDevices();
    } catch (err) {
      this.cloudFailed(err);
      return;
    }
    const firstSuccess = this.cloudState !== 'ok';
    this.cloudState = 'ok';
    this.cloudBackoff = 1;
    const seen = new Set();
    for (const entry of entries) {
      const snapshot = fromCloud(entry);
      if (!snapshot) {
        continue;
      }
      const id = idsOf(this.gladys, snapshot).device;
      seen.add(id);
      await this.track(id, snapshot);
    }
    for (const [id, snapshot] of [...this.snapshots]) {
      if (snapshot.source === 'cloud' && !seen.has(id)) {
        this.snapshots.delete(id);
      }
    }
    if (!this.issues.ok('cloud', 'Mill cloud answers again') && firstSuccess) {
      logger.info(`Connected to the Mill cloud: ${seen.size} device(s)`);
    }
  }

  cloudFailed(err) {
    if (err.code === 'auth') {
      this.cloudState = 'auth';
      this.issues.fail(
        'cloud',
        `Mill cloud: ${err.message}. Cloud reads stopped until the configuration changes`,
      );
    } else {
      this.cloudState = 'error';
      if (err.code === 'rate_limit') {
        this.cloudBackoff = Math.min(this.cloudBackoff * 2, 64);
      }
      this.issues.fail('cloud', err.message);
    }
    // The cloud is down, not the devices: no offline trigger, only the badge.
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.source === 'cloud') {
        snapshot.reachable = false;
      }
    }
  }

  async readLocal(discovery) {
    const created = this.createdIds();
    await Promise.all(
      [...this.locals.entries()].map(async ([host, local]) => {
        const knownId = local.identity
          ? this.gladys.externalIds('local', local.identity.mac).device
          : null;
        if (!discovery) {
          if (knownId && !created.has(knownId)) {
            return; // not added to Gladys: not read
          }
          if (!knownId && this.now() - local.triedAt < LOCAL_DISCOVERY_RETRY_MS) {
            return; // never answered: tried again later
          }
        }
        local.triedAt = this.now();
        try {
          if (!local.identity) {
            const status = await local.client.status();
            local.identity = { status, mac: fromLocal(status, {}).platformId };
          }
          const control = await local.client.controlStatus();
          const snapshot = { ...fromLocal(local.identity.status, control), host };
          const id = idsOf(this.gladys, snapshot).device;
          const recovered = this.issues.ok(
            `local:${host}`,
            `Local heater "${snapshot.name}" answers again`,
          );
          if (!recovered && !local.announced) {
            logger.info(`Local heater found: "${snapshot.name}" (Gen 3)`);
          }
          local.announced = true;
          await this.track(id, snapshot);
        } catch (err) {
          this.issues.fail(`local:${host}`, `Local heater ${host}: ${err.message}`);
          if (knownId && this.snapshots.has(knownId)) {
            const snapshot = this.snapshots.get(knownId);
            snapshot.reachable = false;
            await this.connectionChanged(knownId, snapshot, false);
          }
        }
      }),
    );
  }

  /** Keep a fresh snapshot, apply the holds, fire the offline trigger. */
  async track(id, snapshot) {
    snapshot.reachable = snapshot.connected;
    this.applyHolds(id, snapshot);
    this.snapshots.set(id, snapshot);
    await this.connectionChanged(id, snapshot, snapshot.connected);
  }

  /**
   * One trigger per transition to offline, for a device added to Gladys; the
   * first reading of a device is no transition.
   */
  async connectionChanged(id, snapshot, up) {
    const before = this.up.get(id);
    this.up.set(id, up);
    if (before === true && !up && this.createdIds().has(id)) {
      logger.info(`"${snapshot.name}" went offline`);
      await this.gladys
        .publishSceneEvent(TRIGGER_OFFLINE, { device: id, device_name: snapshot.name })
        .catch((err) => logger.warn(`Scene trigger refused (${err.message})`));
    } else if (before === false && up) {
      logger.info(`"${snapshot.name}" is back online`);
    }
  }

  applyHolds(id, snapshot) {
    for (const [key, hold] of this.holds) {
      if (!key.startsWith(`${id}:`)) {
        continue;
      }
      const valueKey = FEATURES[key.slice(id.length + 1)].value;
      if (hold.until < this.now() || snapshot.values[valueKey] === hold.value) {
        this.holds.delete(key);
      } else {
        snapshot.values[valueKey] = hold.value;
      }
    }
  }

  // --- publishing ------------------------------------------------------------

  /** The devices offered in the Discovery tab. */
  discoveredDevices() {
    const localMacs = new Set(
      [...this.snapshots.values()].filter((s) => s.source === 'local').map((s) => s.mac),
    );
    const created = this.createdIds();
    return [...this.snapshots.entries()]
      .filter(([id, snapshot]) => {
        // A Gen 3 heater also reached locally: with "Prefer the local
        // connection", its cloud copy is not offered (unless already added).
        const twin = snapshot.source === 'cloud' && snapshot.mac && localMacs.has(snapshot.mac);
        return !(twin && this.config.preferLocal && !created.has(id));
      })
      .map(([, snapshot]) => buildDevice(this.gladys, snapshot, this.config.language));
  }

  async publishDiscovery() {
    await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
  }

  /** States of the devices added to Gladys, only what changed. */
  async publishStates(onlyId) {
    const created = this.createdIds();
    const states = [];
    for (const [id, snapshot] of this.snapshots) {
      if (!created.has(id) || (onlyId && id !== onlyId) || snapshot.reachable === false) {
        continue;
      }
      states.push(...statesOf(this.gladys, snapshot, this.extraValues(id, snapshot)));
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed (${err.message})`);
    }
  }

  extraValues(id, snapshot) {
    if (snapshot.values.energyToday === undefined || !this.energy) {
      return {};
    }
    return { energyIndex: this.energy.update(id, snapshot.values.energyToday) };
  }

  async publishTransports() {
    const entries = [];
    for (const [id, snapshot] of this.snapshots) {
      const transport =
        snapshot.reachable === false
          ? DEVICE_TRANSPORTS.UNREACHABLE
          : snapshot.source === 'local'
            ? DEVICE_TRANSPORTS.LOCAL
            : DEVICE_TRANSPORTS.CLOUD;
      if (this.transports.get(id) !== transport) {
        entries.push({ external_id: id, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.debug(`Transport badges refused (${err.message})`);
    }
  }

  /** The connection status of the Configuration screen, sent when it changes. */
  async reportStatus() {
    const config = this.config;
    let message = null;
    if (!isConfigured(config)) {
      message = MESSAGES.notConfigured;
    } else if (this.cloud && this.cloudState === 'auth') {
      message = MESSAGES.authFailed;
    } else if (this.cloud && this.cloudState === 'error') {
      message = MESSAGES.cloudUnreachable;
    } else if (
      config.hosts.length > 0 &&
      ![...this.snapshots.values()].some((s) => s.source === 'local' && s.reachable !== false)
    ) {
      message = MESSAGES.localUnreachable;
    }
    const key = message ? message.en : 'ok';
    if (key === this.statusKey) {
      return;
    }
    this.statusKey = key;
    await this.gladys.setConnectionStatus(message === null, message ?? undefined).catch(() => {
      this.statusKey = null;
    });
  }

  // --- Gladys events ---------------------------------------------------------

  /** The user added a device: send its states now (Gladys dropped the earlier ones). */
  async onDeviceCreated(device) {
    const snapshot = this.snapshots.get(device.external_id);
    if (!snapshot) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.gladys.requestWidgetRefresh?.(WIDGET_KEY);
  }

  /** Discovery asked by the user: read everything, publish the list. */
  async rediscover() {
    this.cloud?.forgetHouses();
    if (this.cloudState === 'auth') {
      this.cloudState = 'pending';
    }
    await this.refreshAll({ discovery: true });
    await this.publishDiscovery();
  }

  // --- commands --------------------------------------------------------------

  /**
   * A command from Gladys (dashboard, scene).
   * @throws when the device or the value is not supported, or Mill refuses
   */
  async setValue(device, feature, value) {
    const snapshot = this.snapshots.get(device.external_id);
    const key = featureKeyOf(device, feature);
    if (!snapshot || !isThermostat(snapshot)) {
      throw new Error('Unknown Mill device, run a new search');
    }
    if (key === 'target') {
      await this.setTarget(device.external_id, snapshot, value);
    } else if (key === 'mode') {
      await this.setMode(device.external_id, snapshot, value);
    } else {
      throw new Error(`Feature ${key} is read-only`);
    }
    await this.publishStates(device.external_id);
    this.gladys.requestWidgetRefresh?.(WIDGET_KEY);
  }

  async setTarget(id, snapshot, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`Invalid set-point: ${value}`);
    }
    const target = Math.round(Math.min(TARGET_MAX, Math.max(TARGET_MIN, number)) * 10) / 10;
    if (snapshot.source === 'cloud') {
      // As millheater does: the set-point of the individual mode, which the
      // heater only follows in that mode.
      await this.cloudClient().setSettings(snapshot.platformId, snapshot.deviceType, {
        operation_mode: CLOUD_MODE_OF[THERMOSTAT_MODE.HEATING],
        temperature_normal: target,
      });
      this.hold(id, snapshot, 'mode', THERMOSTAT_MODE.HEATING);
    } else {
      await this.localClient(snapshot).setTemperature(target);
    }
    this.hold(id, snapshot, 'target', target);
    logger.info(`Set-point of "${snapshot.name}" set to ${target} °C`);
  }

  async setMode(id, snapshot, value) {
    const mode = Number(value);
    if (!SUPPORTED_MODES.includes(mode)) {
      throw new Error(`Unsupported mode: ${value} (off, heating or auto)`);
    }
    if (snapshot.source === 'cloud') {
      await this.cloudClient().setSettings(snapshot.platformId, snapshot.deviceType, {
        operation_mode: CLOUD_MODE_OF[mode],
      });
    } else {
      await this.localClient(snapshot).setMode(LOCAL_MODE_OF[mode]);
    }
    this.hold(id, snapshot, 'mode', mode);
    if (mode === THERMOSTAT_MODE.OFF && snapshot.values.heating !== undefined) {
      this.hold(id, snapshot, 'heating', 0);
    }
    logger.info(`Mode of "${snapshot.name}" set to ${CLOUD_MODE_OF[mode]}`);
  }

  hold(id, snapshot, key, value) {
    snapshot.values[FEATURES[key].value] = value;
    this.holds.set(`${id}:${key}`, { value, until: this.now() + HOLD_MS });
  }

  cloudClient() {
    if (!this.cloud) {
      throw new Error('Mill cloud not configured');
    }
    return this.cloud;
  }

  localClient(snapshot) {
    const local = this.locals.get(snapshot.host);
    if (!local) {
      throw new Error('Local heater no longer configured');
    }
    return local.client;
  }

  /** The heaters and sockets added to Gladys, by external id. */
  createdThermostats() {
    const created = this.createdIds();
    return [...this.snapshots.entries()].filter(
      ([id, snapshot]) => created.has(id) && isThermostat(snapshot),
    );
  }

  /**
   * One mode for every heater added to Gladys (scene action, widget buttons).
   * @returns {Promise<{ changed: number, failed: number }>}
   */
  async setModeAll(mode) {
    let changed = 0;
    let failed = 0;
    for (const [id, snapshot] of this.createdThermostats()) {
      try {
        await this.setMode(id, snapshot, mode);
        changed += 1;
      } catch (err) {
        failed += 1;
        logger.warn(`"${snapshot.name}": mode not changed (${err.message})`);
      }
    }
    await this.publishStates();
    this.gladys.requestWidgetRefresh?.(WIDGET_KEY);
    return { changed, failed };
  }

  /** What the "Test the connection" action reports. */
  async testConnection() {
    const result = { cloud: null, locals: [], invalidHosts: this.config.invalidHosts };
    if (this.cloud) {
      if (this.cloudState === 'auth') {
        this.cloudState = 'pending';
      }
      await this.refresh('cloud', { discovery: true });
      result.cloud =
        this.cloudState === 'ok'
          ? {
              ok: true,
              count: [...this.snapshots.values()].filter((s) => s.source === 'cloud').length,
            }
          : { ok: false, auth: this.cloudState === 'auth' };
    }
    for (const [host, local] of this.locals) {
      try {
        const status = await local.client.status();
        result.locals.push({ host, ok: true, name: String(status.name || 'Mill') });
      } catch (err) {
        result.locals.push({ host, ok: false, reason: err.message.replace(/^local heater: /, '') });
      }
    }
    await this.publishDiscovery();
    return result;
  }
}
