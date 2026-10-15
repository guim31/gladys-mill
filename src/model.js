// -----------------------------------------------------------------------------
// Mill payloads → one snapshot shape, whatever the source.
//
// A snapshot is what the rest of the code knows of one Mill device:
//   { source, platformId, kind, name, model, room, mac, deviceType, connected,
//     values: { temperature, target, mode, heating, power, energyToday,
//               humidity, co2, tvoc, battery, pm25, pm10,
//               childLock, windowOpen, frostProtection } }
// A value the device does not report is absent from `values`: its feature is
// not created (cloud sensors) or its state not published.
//
// Field names come from millheater (cloud) and mill-local (local), the
// libraries of the Home Assistant integration. The units: temperatures in °C,
// power in W, energyUsageForCurrentDay in Wh (millheater divides it by 1000
// for its kWh sensor).
// -----------------------------------------------------------------------------

import { THERMOSTAT_MODE } from './constants.js';
import { LOCAL_MODES } from './mill/local.js';

export const KIND = {
  HEATER: 'heater',
  SOCKET: 'socket',
  SENSOR: 'sensor',
  PURIFIER: 'purifier',
};

// Cloud `deviceType.parentType.name` → kind.
export function kindOf(parentType) {
  const name = String(parentType ?? '').toLowerCase();
  if (name === 'heaters') {
    return KIND.HEATER;
  }
  if (name === 'sockets') {
    return KIND.SOCKET;
  }
  if (name.includes('purifier')) {
    return KIND.PURIFIER;
  }
  if (name === 'sensors') {
    return KIND.SENSOR;
  }
  return null;
}

/** The kinds that heat, and take a set-point and a mode. */
export const isThermostat = (snapshot) =>
  snapshot.kind === KIND.HEATER || snapshot.kind === KIND.SOCKET;

const num = (value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const round = (value, decimals) =>
  value === undefined ? undefined : Number(value.toFixed(decimals));

const bool = (value) => (value === undefined || value === null ? undefined : value ? 1 : 0);

/** MAC address as 12 lower-case hex digits, or undefined. */
export function normalizeMac(value) {
  const hex = String(value ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  return hex.length === 12 ? hex : undefined;
}

// Cloud `operation_mode` → Gladys thermostat mode. A Mill heater in its weekly
// programme follows its own schedule: that is AUTO for Gladys.
const CLOUD_MODES = {
  off: THERMOSTAT_MODE.OFF,
  weekly_program: THERMOSTAT_MODE.AUTO,
  control_individually: THERMOSTAT_MODE.HEATING,
  independent_device: THERMOSTAT_MODE.HEATING,
};

export const CLOUD_MODE_OF = {
  [THERMOSTAT_MODE.OFF]: 'off',
  [THERMOSTAT_MODE.HEATING]: 'control_individually',
  [THERMOSTAT_MODE.AUTO]: 'weekly_program',
};

const LOCAL_MODE_VALUES = {
  [LOCAL_MODES.OFF.toLowerCase()]: THERMOSTAT_MODE.OFF,
  [LOCAL_MODES.WEEKLY.toLowerCase()]: THERMOSTAT_MODE.AUTO,
  [LOCAL_MODES.INDIVIDUAL.toLowerCase()]: THERMOSTAT_MODE.HEATING,
  [LOCAL_MODES.INDEPENDENT.toLowerCase()]: THERMOSTAT_MODE.HEATING,
};

export const LOCAL_MODE_OF = {
  [THERMOSTAT_MODE.OFF]: LOCAL_MODES.OFF,
  [THERMOSTAT_MODE.HEATING]: LOCAL_MODES.INDIVIDUAL,
  [THERMOSTAT_MODE.AUTO]: LOCAL_MODES.WEEKLY,
};

// Cloud `openWindowsStatus`: 0 disabled, 3 enabled but not active, 2 active.
const WINDOW_ACTIVE = 2;

const clean = (values) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

/**
 * One device of the Mill cloud.
 * @param {{ device: object, room?: { name: string } | null, house?: object }} entry
 * @returns {object|null} null for a device type the integration does not know
 */
export function fromCloud({ device, room = null }) {
  const kind = kindOf(device?.deviceType?.parentType?.name);
  if (!kind || !device.deviceId) {
    return null;
  }
  const model = device.deviceType?.childType?.name ?? '';
  const metrics = device.lastMetrics ?? {};
  const reported = device.deviceSettings?.reported ?? {};
  const desired = device.deviceSettings?.desired ?? {};

  let values;
  if (kind === KIND.HEATER || kind === KIND.SOCKET) {
    const mode =
      CLOUD_MODES[String(reported.operation_mode ?? '').toLowerCase()] ??
      (metrics.powerStatus === undefined
        ? undefined
        : num(metrics.powerStatus) > 0
          ? THERMOSTAT_MODE.HEATING
          : THERMOSTAT_MODE.OFF);
    const today = num(device.energyUsageForCurrentDay);
    values = {
      temperature: round(num(metrics.temperatureAmbient), 1),
      target: num(metrics.temperature) ?? num(desired.temperature_normal),
      mode,
      heating: metrics.heaterFlag === undefined ? undefined : num(metrics.heaterFlag) > 0 ? 1 : 0,
      power: round(num(metrics.currentPower), 0),
      energyToday: today === undefined ? undefined : round(today / 1000, 3),
      humidity: kind === KIND.SOCKET ? round(num(metrics.humidity), 1) : undefined,
      childLock:
        reported.lock_status === undefined
          ? undefined
          : reported.lock_status === 'child_lock'
            ? 1
            : 0,
      windowOpen:
        metrics.openWindowsStatus === undefined
          ? undefined
          : num(metrics.openWindowsStatus) === WINDOW_ACTIVE
            ? 1
            : 0,
      frostProtection: bool(reported.frost_protection_active),
    };
  } else {
    values = {
      temperature: round(num(metrics.temperature), 1),
      humidity: round(num(metrics.humidity), 1),
      co2: round(num(metrics.eco2), 0),
      tvoc: round(num(metrics.tvoc), 0),
      battery: round(num(metrics.batteryPercentage), 0),
      pm25: round(num(metrics.massPm_25), 1),
      pm10: round(num(metrics.massPm_100), 1),
    };
  }

  return {
    source: 'cloud',
    platformId: String(device.deviceId),
    kind,
    name: String(device.customName || model || 'Mill').trim(),
    model,
    room: room?.name || '',
    mac: normalizeMac(device.macAddress),
    deviceType: device.deviceType?.parentType?.name,
    connected: device.isConnected !== false,
    values: clean(values),
  };
}

/**
 * One Gen 3 heater on the local API.
 * @param {object} status answer of GET /status
 * @param {object} control answer of GET /control-status
 */
export function fromLocal(status, control) {
  const mac = normalizeMac(status.mac_address);
  const power = round(num(control.current_power), 0);
  const mode = LOCAL_MODE_VALUES[String(control.operation_mode ?? '').toLowerCase()];
  return {
    source: 'local',
    platformId: mac,
    kind: KIND.HEATER,
    name: String(status.name || 'Mill').trim(),
    model: 'Gen 3',
    room: '',
    mac,
    connected: true,
    values: clean({
      temperature: round(num(control.ambient_temperature), 1),
      target: num(control.set_temperature),
      mode,
      // Home Assistant's rule: the heater heats while it draws power.
      heating: power === undefined ? undefined : power > 0 && mode !== THERMOSTAT_MODE.OFF ? 1 : 0,
      power,
      humidity: round(num(control.humidity), 1),
      childLock: bool(control.lock_active),
      windowOpen: bool(control.open_window_active_now),
    }),
  };
}
