// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a simulated Mill (cloud and
// local heaters), a temporary /data, and the integration wired on top through
// registerHandlers — the same wiring as index.js.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ACCOUNT, createFakeMill, localHeater } from './fakeMill.js';

// The integration logs its lifecycle; keep the test output readable.
// LOG_LEVEL=debug npm test shows everything.
process.env.LOG_LEVEL ??= 'silent';

export const LOCAL_HOST = '192.0.2.40';

/** A clock the tests move by hand. */
export function createClock(start = Date.parse('2026-10-15T08:00:00Z')) {
  let time = start;
  const clock = () => time;
  clock.advance = (ms) => {
    time += ms;
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.cloud] fill in the Mill account
 * @param {Record<string, object>} [options.heaters] local heaters by host
 * @param {object} [options.config] raw config overrides
 * @param {Array} [options.gladysDevices] devices already created in Gladys
 * @param {boolean} [options.timers] run the refresh timers
 * @param {object} [options.timings]
 * @param {boolean} [options.connect]
 * @param {object} [options.mill] a fake Mill to reuse (a restart)
 */
export async function createWorld({
  cloud = true,
  heaters = { [LOCAL_HOST]: localHeater() },
  config = {},
  gladysDevices = [],
  timers = false,
  timings,
  connect = true,
  now = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-mill-')),
  mill = createFakeMill({ heaters, now }),
} = {}) {
  const rawConfig = {
    ...(cloud ? { username: ACCOUNT.username, password: ACCOUNT.password } : {}),
    local_hosts: Object.keys(mill.heaters).join(', '),
    ...config,
  };
  const gladys = createFakeGladys({ config: rawConfig, devices: gladysDevices });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: mill.fetch,
    now,
    timers,
    timings,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, mill, app, hub: app.hub, store, dataDir, now };
}

/** Create every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.gladys.fake.discoveredDevices) {
    await world.gladys.fake.deviceCreated(device);
  }
}

/** The discovered device whose name starts with `name`. */
export function discovered(world, name) {
  const device = world.gladys.fake.discoveredDevices.find((d) => d.name.startsWith(name));
  if (!device) {
    throw new Error(`no discovered device named ${name}`);
  }
  return device;
}

/** A feature of a discovered device, by key. */
export const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id === `${device.external_id}:${key}`);

/** Last state of a device feature. */
export const stateOf = (world, device, key) =>
  world.gladys.fake.lastState(`${device.external_id}:${key}`);

/** Let the timers and pending promises run (real time, short). */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
