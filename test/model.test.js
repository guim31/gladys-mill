// -----------------------------------------------------------------------------
// Mill payloads → snapshots: modes, flags and units.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THERMOSTAT_MODE } from '../src/constants.js';
import { fromCloud, fromLocal, kindOf, normalizeMac } from '../src/model.js';
import { FIXTURES } from './helpers/fakeMill.js';

const rooms = FIXTURES.houseDevices();
const [salon, socket] = rooms[0].devices;
const [chambre] = rooms[1].devices;
const [sense, purifier, gadget] = FIXTURES.independent().items;

test('kinds come from the parent type of the cloud device', () => {
  assert.equal(kindOf('Heaters'), 'heater');
  assert.equal(kindOf('Sockets'), 'socket');
  assert.equal(kindOf('Sensors'), 'sensor');
  assert.equal(kindOf('Air Purifiers'), 'purifier');
  assert.equal(kindOf('Gadgets'), null);
  assert.equal(fromCloud({ device: gadget }), null);
});

test('a cloud heater: temperatures, mode, heating, power, energy in kWh, flags', () => {
  const snapshot = fromCloud({ device: salon, room: { name: 'Salon' } });
  assert.equal(snapshot.kind, 'heater');
  assert.equal(snapshot.room, 'Salon');
  assert.equal(snapshot.mac, '02005e100001');
  assert.equal(snapshot.deviceType, 'Heaters');
  assert.deepEqual(snapshot.values, {
    temperature: 20.6,
    target: 21,
    mode: THERMOSTAT_MODE.HEATING,
    heating: 1,
    power: 640,
    energyToday: 2.31,
    childLock: 0,
    windowOpen: 0,
    frostProtection: 0,
  });
});

test('cloud modes: weekly programme is AUTO, off is OFF; window active is 1; child lock', () => {
  const s = fromCloud({ device: socket });
  assert.equal(s.values.mode, THERMOSTAT_MODE.AUTO);
  assert.equal(s.values.childLock, 1);
  assert.equal(s.values.humidity, 47.3);
  assert.equal(s.values.target, 19);

  const c = fromCloud({ device: chambre });
  assert.equal(c.values.mode, THERMOSTAT_MODE.OFF);
  assert.equal(c.values.windowOpen, 1, 'openWindowsStatus 2 = an open window detected');
  assert.equal(c.values.target, 18, 'from the desired settings when lastMetrics has none');
});

test('without operation_mode, the power status gives on or off', () => {
  const device = structuredClone(salon);
  delete device.deviceSettings.reported.operation_mode;
  assert.equal(fromCloud({ device }).values.mode, THERMOSTAT_MODE.HEATING);
  device.lastMetrics.powerStatus = 0;
  assert.equal(fromCloud({ device }).values.mode, THERMOSTAT_MODE.OFF);
});

test('an offline cloud device is not connected', () => {
  const device = { ...structuredClone(salon), isConnected: false };
  assert.equal(fromCloud({ device }).connected, false);
});

test('a Mill Sense and an air purifier: only what they report', () => {
  assert.deepEqual(fromCloud({ device: sense }).values, {
    temperature: 21.4,
    humidity: 44.1,
    co2: 612,
    tvoc: 143,
    battery: 87,
  });
  assert.deepEqual(fromCloud({ device: purifier }).values, {
    temperature: 22.1,
    humidity: 39.8,
    pm25: 4.6,
    pm10: 7.9,
  });
});

test('a local Gen 3 heater: MAC as id, modes, heating while it draws power', () => {
  const minimal = fromLocal(FIXTURES.localStatus(), FIXTURES.localControl());
  assert.equal(minimal.platformId, '02005e100099');
  assert.deepEqual(minimal.values, {
    temperature: 19.8,
    target: 20.5,
    mode: THERMOSTAT_MODE.AUTO,
    heating: 0,
    power: 0,
  });
  const extended = fromLocal(FIXTURES.localStatus(), FIXTURES.localControlExtended());
  assert.deepEqual(extended.values, {
    temperature: 21.2,
    target: 22,
    mode: THERMOSTAT_MODE.HEATING,
    heating: 1,
    power: 850,
    humidity: 38.5,
    childLock: 0,
    windowOpen: 0,
  });
  const off = fromLocal(FIXTURES.localStatus(), {
    ...FIXTURES.localControlExtended(),
    operation_mode: 'OFF',
  });
  assert.equal(off.values.mode, THERMOSTAT_MODE.OFF);
  assert.equal(off.values.heating, 0);
});

test('MAC addresses are normalized, anything else refused', () => {
  assert.equal(normalizeMac('02:00:5E:10:00:99'), '02005e100099');
  assert.equal(normalizeMac('02-00-5e-10-00-99'), '02005e100099');
  assert.equal(normalizeMac('nope'), undefined);
  assert.equal(normalizeMac(undefined), undefined);
});
