// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal refresh cycle, and no secret
// of the configuration (password, tokens) in any line, at any level — startup,
// commands, failures included.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THERMOSTAT_MODE } from '../src/constants.js';
import { ACCOUNT } from './helpers/fakeMill.js';
import { LOCAL_HOST, createAll, createWorld, discovered, featureOf } from './helpers/world.js';

/** Capture every log line (all levels) while `fn` runs. */
async function capture(t, fn) {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  try {
    await fn();
  } finally {
    process.env.LOG_LEVEL = previous;
    t.mock.restoreAll();
  }
  return lines;
}

const loud = (lines) => lines.filter((line) => /\[(INFO|WARN|ERROR)\]/.test(line));

test('a normal refresh cycle writes nothing at info level', async (t) => {
  const world = await createWorld();
  await createAll(world);
  const lines = await capture(t, async () => {
    for (let i = 0; i < 3; i += 1) {
      world.now.advance(60 * 1000);
      world.mill.cloudDevice('a1b2c3d4-0000-4000-8000-000000000101').lastMetrics.currentPower =
        600 + i;
      await world.hub.refresh('cloud');
      await world.hub.refresh('local');
      await world.gladys.fake.widgetGet('overview', { language: 'fr' });
    }
  });
  assert.deepEqual(loud(lines), []);
  await world.app.stop();
});

test('a repeated failure is one warning, then one line on recovery', async (t) => {
  const world = await createWorld();
  await createAll(world);
  const lines = await capture(t, async () => {
    world.mill.heaters[LOCAL_HOST].down = true;
    world.mill.failCloud = 'server';
    for (let i = 0; i < 4; i += 1) {
      world.now.advance(60 * 1000);
      await world.hub.refresh('cloud');
      await world.hub.refresh('local');
    }
    world.mill.heaters[LOCAL_HOST].down = false;
    world.mill.failCloud = null;
    await world.hub.refresh('cloud');
    await world.hub.refresh('local');
  });
  const warnings = lines.filter((line) => line.includes('[WARN]'));
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.ok(lines.some((line) => /\[INFO\].*Mill cloud answers again/.test(line)));
  assert.ok(lines.some((line) => /\[INFO\].*answers again/.test(line)));
  await world.app.stop();
});

test('no password nor token in the logs, whatever happens', async (t) => {
  let world;
  const lines = await capture(t, async () => {
    world = await createWorld();
    await createAll(world);
    const salon = discovered(world, 'Radiateur salon');
    await world.gladys.fake.setValue(salon, featureOf(salon, 'target'), 19);
    await world.gladys.fake.setValue(salon, featureOf(salon, 'mode'), THERMOSTAT_MODE.AUTO);
    await world.gladys.fake.action('test_connection');
    world.now.advance(11 * 60 * 1000);
    await world.hub.refresh('cloud');
    world.mill.account.password = 'changed elsewhere';
    world.mill.refreshTokens.clear();
    world.now.advance(11 * 60 * 1000);
    await world.hub.refresh('cloud');
    await world.gladys.fake.configUpdated({ username: ACCOUNT.username, password: 'typo' });
  });
  const secrets = [
    ACCOUNT.password,
    'typo',
    ...world.mill.issued,
    ...world.mill.refreshTokens,
    'refresh-0',
  ];
  for (const line of lines) {
    for (const secret of secrets) {
      assert.ok(!line.includes(secret), `a secret in the logs: ${line}`);
    }
  }
  assert.ok(lines.length > 5, 'the scenario did log');
  await world.app.stop();
});
