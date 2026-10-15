// -----------------------------------------------------------------------------
// Gladys devices built from Mill snapshots (src/model.js).
//
// One Gladys device per Mill device:
//   - a cloud device:  externalIds('cloud', <Mill deviceId>)
//   - a local heater:  externalIds('local', <MAC address>)
// Both ids come from Mill, never from a name: they are forever. A Gen 3 heater
// reached both ways is two sources of the same radiator; see src/hub.js for
// which copy is offered.
//
// Feature keys are forever too (they end every feature external id). The
// feature set of a device depends on its kind, and for the cloud sensors and
// the optional heater flags on what the device reports when it is discovered.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { THERMOSTAT_MODE } from './constants.js';
import { MODE_LABELS, NAMES } from './i18n.js';
import { KIND, isThermostat } from './model.js';

// Set-point range of the Mill heaters (Home Assistant: 5 to 35 °C).
export const TARGET_MIN = 5;
export const TARGET_MAX = 35;

export const SUPPORTED_MODES = [THERMOSTAT_MODE.OFF, THERMOSTAT_MODE.HEATING, THERMOSTAT_MODE.AUTO];

/**
 * Feature specs, by key. `value` is the key of the snapshot value it shows
 * (src/model.js); `always` features are created for every thermostat even when
 * the first reading lacks the value.
 */
export const FEATURES = {
  temperature: {
    value: 'temperature',
    category: CAT.TEMPERATURE_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.CELSIUS,
    min: -20,
    max: 60,
  },
  target: {
    value: 'target',
    category: CAT.THERMOSTAT,
    type: TYPE.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNIT.CELSIUS,
    min: TARGET_MIN,
    max: TARGET_MAX,
    step: 0.5,
    command: true,
  },
  mode: {
    value: 'mode',
    category: CAT.THERMOSTAT,
    type: TYPE.THERMOSTAT.MODE,
    min: 0,
    max: THERMOSTAT_MODE.AUTO,
    command: true,
  },
  heating: {
    value: 'heating',
    category: CAT.THERMOSTAT,
    type: TYPE.THERMOSTAT.OPERATING_STATE,
    min: 0,
    max: 1,
  },
  power: {
    value: 'power',
    category: CAT.ENERGY_SENSOR,
    type: TYPE.ENERGY_SENSOR.POWER,
    unit: UNIT.WATT,
    min: 0,
    max: 4000,
  },
  energy_today: {
    value: 'energyToday',
    category: CAT.ENERGY_SENSOR,
    type: TYPE.ENERGY_SENSOR.ENERGY,
    unit: UNIT.KILOWATT_HOUR,
    min: 0,
    max: 100,
  },
  energy_index: {
    value: 'energyIndex',
    category: CAT.ENERGY_SENSOR,
    type: TYPE.ENERGY_SENSOR.INDEX,
    unit: UNIT.KILOWATT_HOUR,
    min: 0,
    max: 1000000,
  },
  humidity: {
    value: 'humidity',
    category: CAT.HUMIDITY_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
  co2: {
    value: 'co2',
    category: CAT.CO2_SENSOR,
    type: TYPE.SENSOR.INTEGER,
    unit: UNIT.PPM,
    min: 0,
    max: 10000,
  },
  tvoc: {
    value: 'tvoc',
    category: CAT.VOC_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PPB,
    min: 0,
    max: 60000,
  },
  battery: {
    value: 'battery',
    category: CAT.BATTERY,
    type: TYPE.BATTERY.INTEGER,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
  pm25: {
    value: 'pm25',
    category: CAT.PM25_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  pm10: {
    value: 'pm10',
    category: CAT.PM10_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  child_lock: {
    value: 'childLock',
    category: CAT.CHILD_LOCK,
    type: TYPE.CHILD_LOCK.BINARY,
    min: 0,
    max: 1,
  },
  window_open: {
    value: 'windowOpen',
    category: CAT.INPUT,
    type: TYPE.INPUT.BINARY,
    min: 0,
    max: 1,
  },
  frost_protection: {
    value: 'frostProtection',
    category: CAT.INPUT,
    type: TYPE.INPUT.BINARY,
    min: 0,
    max: 1,
  },
};

// Created for every heater and socket, whatever the first reading says.
const THERMOSTAT_FEATURES = ['temperature', 'target', 'mode', 'heating', 'power'];
// Created when the device reports the value at discovery.
const OPTIONAL_FEATURES = [
  'energy_today',
  'humidity',
  'child_lock',
  'window_open',
  'frost_protection',
];
const SENSOR_FEATURES = ['temperature', 'humidity', 'co2', 'tvoc', 'battery', 'pm25', 'pm10'];

/** The feature keys of a snapshot, in display order. */
export function featureKeys(snapshot) {
  const has = (key) => snapshot.values[FEATURES[key].value] !== undefined;
  if (isThermostat(snapshot)) {
    const keys = [...THERMOSTAT_FEATURES, ...OPTIONAL_FEATURES.filter(has)];
    if (has('energy_today')) {
      // The index the integration counts from the daily energy (src/energy.js).
      keys.splice(keys.indexOf('energy_today') + 1, 0, 'energy_index');
    }
    return keys;
  }
  return SENSOR_FEATURES.filter(has);
}

/** External ids of a snapshot's device. */
export const idsOf = (gladys, snapshot) => gladys.externalIds(snapshot.source, snapshot.platformId);

const MODEL_NAME = {
  [KIND.HEATER]: 'heater',
  [KIND.SOCKET]: 'socket',
  [KIND.SENSOR]: 'sensor',
  [KIND.PURIFIER]: 'air purifier',
};

/**
 * The discovery payload of one snapshot.
 * @param {object} gladys
 * @param {object} snapshot
 * @param {string} language feature names language
 */
export function buildDevice(gladys, snapshot, language) {
  const ids = idsOf(gladys, snapshot);
  const names = NAMES[language] ?? NAMES.fr;
  const features = featureKeys(snapshot).map((key) => {
    const spec = FEATURES[key];
    const feature = {
      name: names[key],
      external_id: ids.feature(key),
      category: spec.category,
      type: spec.type,
      min: spec.min,
      max: spec.max,
      read_only: !spec.command,
      has_feedback: Boolean(spec.command),
      keep_history: true,
    };
    if (spec.unit) {
      feature.unit = spec.unit;
    }
    if (spec.step) {
      feature.step = spec.step;
    }
    if (key === 'mode') {
      const labels = MODE_LABELS[language] ?? MODE_LABELS.fr;
      feature.supported_options = SUPPORTED_MODES.map((value, index) => ({
        value,
        label: labels[value],
        sort_order: index,
      }));
    }
    return feature;
  });

  const params = [
    { name: 'source', value: snapshot.source },
    { name: 'kind', value: snapshot.kind },
  ];
  if (snapshot.model) {
    params.push({ name: 'model', value: snapshot.model });
  }
  if (snapshot.source === 'local' && snapshot.host) {
    params.push({ name: 'host', value: snapshot.host });
  }

  return {
    name:
      snapshot.room && snapshot.room !== snapshot.name
        ? `${snapshot.name} (${snapshot.room})`
        : snapshot.name,
    external_id: ids.device,
    model: `Mill ${snapshot.model || MODEL_NAME[snapshot.kind]}`.trim(),
    // The container refreshes the devices itself (src/poller.js); the core's
    // poll is a fallback, at its slowest pace.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params,
    features,
  };
}

/**
 * The states of a snapshot, for publishChangedStates.
 * @param {object} gladys
 * @param {object} snapshot
 * @param {Record<string, number>} [extra] values computed by the integration (energyIndex)
 */
export function statesOf(gladys, snapshot, extra = {}) {
  const ids = idsOf(gladys, snapshot);
  const values = { ...snapshot.values, ...extra };
  return featureKeys(snapshot)
    .filter((key) => values[FEATURES[key].value] !== undefined)
    .map((key) => ({
      device_feature_external_id: ids.feature(key),
      state: values[FEATURES[key].value],
    }));
}
