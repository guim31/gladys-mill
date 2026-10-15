// -----------------------------------------------------------------------------
// The two Mill clients against the simulated Mill: the requests they send and
// how they treat refusals.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MillCloud, accountHash, tokenExpiry } from '../src/mill/cloud.js';
import { MillLocal } from '../src/mill/local.js';
import { ACCOUNT, createFakeMill, fakeJwt, localHeater } from './helpers/fakeMill.js';
import { createClock } from './helpers/world.js';

test('the token expiry is read from the JWT, without verifying it', () => {
  assert.equal(tokenExpiry(fakeJwt(1760000000)), 1760000000 * 1000);
  assert.equal(tokenExpiry('not a jwt'), undefined);
  assert.equal(accountHash(' Someone@Example.com '), accountHash('someone@example.com'));
});

test('cloud: sign-in, then the houses and the devices of each', async () => {
  const now = createClock();
  const mill = createFakeMill({ now });
  const cloud = new MillCloud({ ...ACCOUNT, fetch: mill.fetch, now });
  const entries = await cloud.listDevices();
  assert.equal(entries.length, 6);
  assert.deepEqual(entries[0].room, { id: 'a1b2c3d4-0000-4000-8000-0000000000a1', name: 'Salon' });
  assert.equal(entries.at(-1).room, null, 'independent devices have no room');
  const signIn = mill.requests[0];
  assert.equal(signIn.url, 'https://api.millnorwaycloud.com/customer/auth/sign-in');
  assert.deepEqual(signIn.body, { login: ACCOUNT.username, password: ACCOUNT.password });
  assert.match(mill.requests[1].headers.authorization, /^Bearer .+\..+\..+$/);

  // The houses are cached half an hour.
  await cloud.listDevices();
  assert.equal(mill.requests.filter((r) => r.url.endsWith('/houses')).length, 1);
});

test('cloud: a wrong password is a MillAuthError, an outage is not', async () => {
  const now = createClock();
  const mill = createFakeMill({ now });
  const wrong = new MillCloud({ ...ACCOUNT, password: 'nope', fetch: mill.fetch, now });
  await assert.rejects(wrong.listDevices(), { name: 'MillAuthError', code: 'auth' });

  mill.failCloud = 'rate_limit';
  const cloud = new MillCloud({ ...ACCOUNT, fetch: mill.fetch, now });
  await assert.rejects(cloud.listDevices(), { code: 'rate_limit' });
  mill.failCloud = 'network';
  await assert.rejects(cloud.listDevices(), (err) => {
    assert.equal(err.code, 'http');
    assert.ok(!err.message.includes('millnorwaycloud'), 'no URL in the message');
    return true;
  });
});

test('cloud: a 401 refreshes the token once and retries', async () => {
  const now = createClock();
  const mill = createFakeMill({ now });
  const cloud = new MillCloud({ ...ACCOUNT, fetch: mill.fetch, now });
  await cloud.connect();
  mill.issued.clear(); // the cloud forgot the token
  await cloud.listHouses();
  assert.equal(mill.refreshes, 1);
  assert.equal(mill.signIns, 1);
});

test('cloud: settings are PATCHed with the device type', async () => {
  const now = createClock();
  const mill = createFakeMill({ now });
  const cloud = new MillCloud({ ...ACCOUNT, fetch: mill.fetch, now });
  await cloud.setSettings('a1b2c3d4-0000-4000-8000-000000000103', 'Heaters', {
    operation_mode: 'off',
  });
  const patch = mill.requests.at(-1);
  assert.equal(patch.method, 'PATCH');
  assert.deepEqual(patch.body, {
    deviceType: 'Heaters',
    enabled: true,
    settings: { operation_mode: 'off' },
  });
});

test('local: status, control status and the two commands', async () => {
  const mill = createFakeMill({ heaters: { '192.0.2.40': localHeater() } });
  const heater = new MillLocal('192.0.2.40', { fetch: mill.fetch });
  assert.equal((await heater.status()).mac_address, '02:00:5E:10:00:99');
  assert.equal((await heater.controlStatus()).operation_mode, 'Weekly program');
  await heater.setTemperature(21.5);
  await heater.setMode('OFF');
  assert.deepEqual(
    mill.requests.map((r) => [r.method, r.url, r.body]),
    [
      ['GET', 'http://192.0.2.40/status', undefined],
      ['GET', 'http://192.0.2.40/control-status', undefined],
      ['POST', 'http://192.0.2.40/set-temperature', { type: 'Normal', value: 21.5 }],
      ['POST', 'http://192.0.2.40/operation-mode', { mode: 'OFF' }],
    ],
  );
});

test('local: an unreachable heater and a device that is not a Mill heater', async () => {
  const mill = createFakeMill({ heaters: { '192.0.2.40': { ...localHeater(), down: true } } });
  await assert.rejects(new MillLocal('192.0.2.40', { fetch: mill.fetch }).status(), {
    message: 'local heater: network error (EHOSTUNREACH)',
  });
  const html = async () => new Response('<html>router</html>', { status: 200 });
  await assert.rejects(
    new MillLocal('192.0.2.1', { fetch: html }).status(),
    /not a Mill|unreadable/,
  );
  const noMac = async () => new Response('{"status":"ok"}', { status: 200 });
  await assert.rejects(new MillLocal('192.0.2.1', { fetch: noMac }).status(), /no MAC address/);
});
