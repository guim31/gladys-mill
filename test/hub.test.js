// -----------------------------------------------------------------------------
// The integration end to end: the SDK's fake Gladys on one side, a simulated
// Mill (cloud and local Gen 3 heaters) on the other.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { THERMOSTAT_MODE } from '../src/constants.js';
import { HEARTBEAT_MS } from '../src/hub.js';
import { localHeater } from './helpers/fakeMill.js';
import {
  LOCAL_HOST,
  createAll,
  createWorld,
  discovered,
  featureOf,
  stateOf,
  wait,
} from './helpers/world.js';

test('discovery: one device per Mill device, unknown types left out', async () => {
  const world = await createWorld();
  const names = world.gladys.fake.discoveredDevices.map((d) => d.name).sort();
  assert.deepEqual(names, [
    'Chambre',
    'Mill Gen3 Bureau',
    'Mill Sense bureau',
    "Prise radiateur bain d'huile (Salon)",
    'Purificateur',
    'Radiateur salon (Salon)',
  ]);
  const local = discovered(world, 'Mill Gen3');
  assert.equal(local.external_id, 'ext:test-integration:local:02005e100099');
  const salon = discovered(world, 'Radiateur salon');
  assert.equal(
    salon.external_id,
    'ext:test-integration:cloud:a1b2c3d4-0000-4000-8000-000000000101',
  );
  assert.equal(world.gladys.fake.connectionStatus?.connected ?? true, true);
  await world.app.stop();
});

test('no state is published before the user adds a device, all of them right after', async () => {
  const world = await createWorld();
  assert.equal(world.gladys.fake.states.length, 0);
  const salon = discovered(world, 'Radiateur salon');
  await world.gladys.fake.deviceCreated(salon);
  assert.equal(stateOf(world, salon, 'temperature'), 20.6);
  assert.equal(stateOf(world, salon, 'target'), 21);
  assert.equal(stateOf(world, salon, 'mode'), THERMOSTAT_MODE.HEATING);
  assert.equal(stateOf(world, salon, 'heating'), 1);
  assert.equal(stateOf(world, salon, 'power'), 640);
  assert.equal(stateOf(world, salon, 'energy_today'), 2.31);
  assert.equal(stateOf(world, salon, 'energy_index'), 2.31);
  assert.equal(stateOf(world, salon, 'window_open'), 0);
  assert.equal(stateOf(world, salon, 'child_lock'), 0);
  // Only this device: the others are not in Gladys.
  const ids = new Set(
    world.gladys.fake.states.map((s) =>
      s.device_feature_external_id.split(':').slice(0, 4).join(':'),
    ),
  );
  assert.deepEqual([...ids], [salon.external_id]);
  assert.ok(world.gladys.fake.widgetRefreshes.includes('overview'));
  await world.app.stop();
});

test('the timers refresh the states without any onPoll from the core', async (t) => {
  const world = await createWorld({
    timers: true,
    timings: { cloudMs: 30, localMs: 30 },
    now: Date.now,
  });
  await createAll(world);
  const salon = discovered(world, 'Radiateur salon');
  const local = discovered(world, 'Mill Gen3');
  const onPoll = t.mock.method(world.hub, 'poll');

  world.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101').lastMetrics.temperatureAmbient =
    18.04;
  world.mill.heaters[LOCAL_HOST].control.ambient_temperature = 22.4;
  await wait(150);

  assert.equal(stateOf(world, salon, 'temperature'), 18);
  assert.equal(stateOf(world, local, 'temperature'), 22.4);
  assert.equal(onPoll.mock.callCount(), 0, 'the core never polled');
  await world.app.stop();
});

test('only the changes are published, and an unchanged value again after the heartbeat', async () => {
  const world = await createWorld();
  await createAll(world);
  const before = world.gladys.fake.states.length;
  await world.hub.refresh('cloud');
  await world.hub.refresh('local');
  assert.equal(world.gladys.fake.states.length, before, 'nothing changed, nothing sent');

  world.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101').lastMetrics.currentPower = 1200;
  await world.hub.refresh('cloud');
  const sent = world.gladys.fake.states.slice(before);
  assert.deepEqual(
    sent.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
    [['power', 1200]],
  );
  assert.ok(HEARTBEAT_MS <= 12 * 60 * 60 * 1000, 'heartbeat at least every 12 h');
  await world.app.stop();
});

test('after the first discovery, devices not added to Gladys are not read', async () => {
  const world = await createWorld();
  const reads = world.mill.requests.length;
  await world.hub.refresh('cloud');
  await world.hub.refresh('local');
  assert.equal(world.mill.requests.length, reads, 'no device added: no read');

  await world.gladys.fake.deviceCreated(discovered(world, 'Mill Gen3'));
  await world.hub.refresh('cloud');
  await world.hub.refresh('local');
  const newReads = world.mill.requests.slice(reads).map((r) => r.url);
  assert.deepEqual(newReads, [`http://${LOCAL_HOST}/control-status`]);
  await world.app.stop();
});

test("the core's onPoll is a fallback: skipped right after a timer read", async () => {
  const world = await createWorld();
  await createAll(world);
  const salon = discovered(world, 'Radiateur salon');
  const reads = world.mill.cloudReads().length;
  assert.deepEqual(await world.gladys.fake.poll(salon), { success: true });
  assert.equal(world.mill.cloudReads().length, reads, 'read less than a period ago: skipped');

  world.now.advance(60 * 1000);
  assert.deepEqual(await world.gladys.fake.poll(salon), { success: true });
  assert.ok(world.mill.cloudReads().length > reads, 'a period later, the poll reads');
  await world.app.stop();
});

test('cloud set-point: individual mode with the new temperature, published at once', async () => {
  const world = await createWorld();
  await createAll(world);
  const socket = discovered(world, 'Prise');
  assert.equal(stateOf(world, socket, 'mode'), THERMOSTAT_MODE.AUTO);

  const ack = await world.gladys.fake.setValue(socket, featureOf(socket, 'target'), 22.26);
  assert.deepEqual(ack, { success: true });
  const patch = world.mill.requests.find((r) => r.method === 'PATCH');
  assert.equal(
    patch.url,
    'https://api.millnorwaycloud.com/devices/a1b2c3d4-0000-4000-8000-000000000102/settings',
  );
  assert.deepEqual(patch.body, {
    deviceType: 'Sockets',
    enabled: true,
    settings: { operation_mode: 'control_individually', temperature_normal: 22.3 },
  });
  assert.equal(stateOf(world, socket, 'target'), 22.3);
  assert.equal(stateOf(world, socket, 'mode'), THERMOSTAT_MODE.HEATING);
  await world.app.stop();
});

test('a command is held against a cloud that reports it late', async () => {
  const world = await createWorld();
  await createAll(world);
  const salon = discovered(world, 'Radiateur salon');
  await world.gladys.fake.setValue(salon, featureOf(salon, 'mode'), THERMOSTAT_MODE.OFF);
  assert.equal(stateOf(world, salon, 'mode'), THERMOSTAT_MODE.OFF);

  // The cloud still says "individual" for a while.
  const device = world.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101');
  device.deviceSettings.reported.operation_mode = 'control_individually';
  world.now.advance(10 * 1000);
  await world.hub.refresh('cloud');
  assert.equal(stateOf(world, salon, 'mode'), THERMOSTAT_MODE.OFF, 'held');

  world.now.advance(40 * 1000);
  await world.hub.refresh('cloud');
  assert.equal(stateOf(world, salon, 'mode'), THERMOSTAT_MODE.HEATING, 'hold over: the cloud wins');
  await world.app.stop();
});

test('cloud modes: off, individual, weekly programme; cooling refused', async () => {
  const world = await createWorld();
  await createAll(world);
  const room = discovered(world, 'Chambre');
  const modes = [];
  for (const mode of [THERMOSTAT_MODE.HEATING, THERMOSTAT_MODE.AUTO, THERMOSTAT_MODE.OFF]) {
    await world.gladys.fake.setValue(room, featureOf(room, 'mode'), mode);
    modes.push(
      world.mill.requests.filter((r) => r.method === 'PATCH').at(-1).body.settings.operation_mode,
    );
  }
  assert.deepEqual(modes, ['control_individually', 'weekly_program', 'off']);
  const refused = await world.gladys.fake.setValue(
    room,
    featureOf(room, 'mode'),
    THERMOSTAT_MODE.COOLING,
  );
  assert.equal(refused.success, false);
  const readOnly = await world.gladys.fake.setValue(room, featureOf(room, 'temperature'), 20);
  assert.equal(readOnly.success, false);
  await world.app.stop();
});

test('local commands: set-temperature and operation-mode on the heater itself', async () => {
  const world = await createWorld({ cloud: false });
  await createAll(world);
  const local = discovered(world, 'Mill Gen3');
  await world.gladys.fake.setValue(local, featureOf(local, 'target'), 40);
  await world.gladys.fake.setValue(local, featureOf(local, 'mode'), THERMOSTAT_MODE.HEATING);
  const posts = world.mill.requests.filter((r) => r.method === 'POST');
  assert.deepEqual(
    posts.map((r) => [r.url, r.body]),
    [
      [`http://${LOCAL_HOST}/set-temperature`, { type: 'Normal', value: 35 }],
      [`http://${LOCAL_HOST}/operation-mode`, { mode: 'Control individually' }],
    ],
  );
  assert.equal(stateOf(world, local, 'target'), 35, 'clamped to the heater range');
  assert.equal(world.mill.heaters[LOCAL_HOST].control.operation_mode, 'Control individually');
  await world.app.stop();
});

test('a heater that stops answering fires the offline trigger once, and its badge turns unreachable', async () => {
  const world = await createWorld();
  await createAll(world);
  const local = discovered(world, 'Mill Gen3');
  const salon = discovered(world, 'Radiateur salon');

  world.mill.heaters[LOCAL_HOST].down = true;
  world.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101').isConnected = false;
  for (let i = 0; i < 3; i += 1) {
    await world.hub.refresh('local');
    await world.hub.refresh('cloud');
  }
  const events = world.gladys.fake.sceneEvents.map((e) => [
    e.key,
    e.data.device,
    e.data.device_name,
  ]);
  assert.deepEqual(
    events.sort(),
    [
      ['device_offline', local.external_id, 'Mill Gen3 Bureau'],
      ['device_offline', salon.external_id, 'Radiateur salon'],
    ].sort(),
  );
  const last = (id) =>
    world.gladys.fake.transports
      .flat()
      .filter((t) => t.device_external_id === id)
      .at(-1).transport;
  assert.equal(last(local.external_id), 'unreachable');
  assert.equal(last(salon.external_id), 'unreachable');

  world.mill.heaters[LOCAL_HOST].down = false;
  await world.hub.refresh('local');
  assert.equal(last(local.external_id), 'local');
  await world.app.stop();
});

test('a cloud outage is no device offline: badges only, then back', async () => {
  const world = await createWorld();
  await createAll(world);
  const salon = discovered(world, 'Radiateur salon');
  world.mill.failCloud = 'server';
  await world.hub.refresh('cloud');
  assert.deepEqual(world.gladys.fake.sceneEvents, []);
  const last = () =>
    world.gladys.fake.transports
      .flat()
      .filter((t) => t.device_external_id === salon.external_id)
      .at(-1).transport;
  assert.equal(last(), 'unreachable');
  assert.equal(world.gladys.fake.connectionStatus.connected, false);

  world.mill.failCloud = null;
  await world.hub.refresh('cloud');
  assert.equal(last(), 'cloud');
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  await world.app.stop();
});

test('a refused account: one sign-in, a clear status, no retry until the configuration changes', async () => {
  const world = await createWorld({ heaters: {}, config: { password: 'wrong' } });
  assert.equal(world.mill.signIns, 1);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.fr, /Compte Mill refusé/);
  for (let i = 0; i < 5; i += 1) {
    world.now.advance(60 * 1000);
    await world.hub.refresh('cloud');
  }
  assert.equal(world.mill.signIns, 1, 'no sign-in loop');

  await world.gladys.fake.configUpdated({
    username: 'someone@example.com',
    password: 'correct horse battery',
  });
  assert.equal(world.mill.signIns, 2);
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
  assert.equal(world.gladys.fake.discoveredDevices.length, 5);
  await world.app.stop();
});

test('429: the cloud is read less often until it answers again', async () => {
  const world = await createWorld({ heaters: {} });
  await createAll(world);
  world.mill.failCloud = 'rate_limit';
  await world.hub.refresh('cloud');
  assert.equal(world.hub.periodMs('cloud'), 120 * 1000);
  await world.hub.refresh('cloud');
  assert.equal(world.hub.periodMs('cloud'), 240 * 1000);
  world.mill.failCloud = null;
  await world.hub.refresh('cloud');
  assert.equal(world.hub.periodMs('cloud'), 60 * 1000);
  await world.app.stop();
});

test('the tokens are kept in /data and refreshed, not signed in again', async () => {
  const world = await createWorld({ heaters: {} });
  await createAll(world);
  assert.equal(world.mill.signIns, 1);
  await world.store.flush();
  const saved = JSON.parse(await readFile(join(world.dataDir, 'mill.json'), 'utf8'));
  assert.ok(saved.cloud.refreshToken);
  assert.ok(!JSON.stringify(saved).includes('correct horse battery'), 'no password in /data');
  assert.ok(!JSON.stringify(saved).includes('someone@example.com'), 'no e-mail in /data');

  world.now.advance(11 * 60 * 1000); // the id token lives 10 minutes
  await world.hub.refresh('cloud');
  assert.equal(world.mill.signIns, 1);
  assert.equal(world.mill.refreshes, 1);
  await world.app.stop();

  // A restart reuses the saved refresh token.
  const signIns = world.mill.signIns;
  const again = await createWorld({ dataDir: world.dataDir, now: world.now, mill: world.mill });
  assert.equal(again.mill.signIns, signIns);
  await again.app.stop();
});

test('a Gen 3 heater both in the cloud and on the LAN is offered once when local is preferred', async () => {
  const heaters = { [LOCAL_HOST]: localHeater({ mac: '02:00:5e:10:00:01' }) };
  const world = await createWorld({ heaters });
  const names = world.gladys.fake.discoveredDevices.map((d) => d.name);
  assert.ok(names.includes('Mill Gen3 Bureau'));
  assert.ok(!names.includes('Radiateur salon (Salon)'), 'its cloud copy is not offered');
  await world.app.stop();

  const both = await createWorld({ heaters, config: { GLADYS_PREFER_LOCAL: false } });
  const all = both.gladys.fake.discoveredDevices.map((d) => d.name);
  assert.ok(all.includes('Mill Gen3 Bureau') && all.includes('Radiateur salon (Salon)'));
  await both.app.stop();
});

test('energy index: grows with the daily energy, survives the midnight reset and a restart', async () => {
  const world = await createWorld({ heaters: {} });
  await createAll(world);
  const salon = discovered(world, 'Radiateur salon');
  const device = world.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101');
  assert.equal(stateOf(world, salon, 'energy_index'), 2.31);

  device.energyUsageForCurrentDay = 3000;
  await world.hub.refresh('cloud');
  assert.equal(stateOf(world, salon, 'energy_index'), 3);
  device.energyUsageForCurrentDay = 150; // a new day
  await world.hub.refresh('cloud');
  assert.equal(stateOf(world, salon, 'energy_today'), 0.15);
  assert.equal(stateOf(world, salon, 'energy_index'), 3.15);
  await world.app.stop();

  const again = await createWorld({ dataDir: world.dataDir, now: world.now, mill: world.mill });
  await createAll(again);
  again.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101').energyUsageForCurrentDay = 400;
  await again.hub.refresh('cloud');
  assert.equal(stateOf(again, salon, 'energy_index'), 3.4);
  await again.app.stop();
});

test('the "Test the connection" action reports the cloud and each heater', async () => {
  const world = await createWorld({
    heaters: { [LOCAL_HOST]: localHeater(), '192.0.2.41': { ...localHeater(), down: true } },
    config: { local_hosts: `${LOCAL_HOST}, 192.0.2.41, not a host!` },
  });
  const ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /Mill cloud: connected, 5 device\(s\)\./);
  assert.match(ack.data.message.en, /192\.0\.2\.40: Mill Gen3 Bureau, answers\./);
  assert.match(ack.data.message.en, /192\.0\.2\.41: network error \(EHOSTUNREACH\)\./);
  assert.match(ack.data.message.fr, /Cloud Mill : connecté/);
  await world.app.stop();
});

test('not configured: a status that says what to fill in, nothing read', async () => {
  const world = await createWorld({ cloud: false, heaters: {} });
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.en, /Mill account/);
  assert.equal(world.mill.requests.length, 0);
  assert.deepEqual(world.gladys.fake.discoveredDevices, []);
  await world.app.stop();
});

test('a reconnection to Gladys sends the states again', async () => {
  const world = await createWorld();
  await createAll(world);
  const before = world.gladys.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.ok(world.gladys.fake.states.length > before, 'everything published again');
  await world.app.stop();
});
