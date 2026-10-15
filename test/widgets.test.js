// -----------------------------------------------------------------------------
// The dashboard widget and the scene action, through the fake Gladys.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { THERMOSTAT_MODE } from '../src/constants.js';
import { buildOverview } from '../src/widgets.js';
import { createAll, createWorld, discovered, stateOf } from './helpers/world.js';

test('overview: one row per heater added, total power, two buttons, within the budget', async () => {
  const world = await createWorld();
  await createAll(world);
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.gladys.fake.widgetGet('overview', { language });
    assert.equal(ack.success, true);
    const content = ack.data.content;
    assert.deepEqual(validateWidgetContent(content), [], language);
    const status = content.components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 4, 'three cloud heaters/sockets and the local heater');
    const power = content.components.find((c) => c.type === 'value' && c.unit === 'W');
    assert.equal(power.value, 640);
    assert.equal(content.components.filter((c) => c.type === 'button').length, 2);
  }
  const fr = (await world.gladys.fake.widgetGet('overview', { language: 'fr' })).data.content;
  const salon = fr.components
    .find((c) => c.type === 'status')
    .items.find((i) => i.label === 'Radiateur salon');
  assert.equal(salon.value, '20.6 → 21 °C · En chauffe');
  await world.app.stop();
});

test('overview: an empty state before any heater is added', async () => {
  const world = await createWorld();
  const content = (await world.gladys.fake.widgetGet('overview', { language: 'es' })).data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text, /Todavía no/);
  await world.app.stop();
});

test('overview: an offline heater says so', () => {
  const content = buildOverview(
    [{ name: 'Bureau', reachable: false, values: { temperature: 19, target: 20, mode: 1 } }],
    'de',
  );
  assert.equal(
    content.components.find((c) => c.type === 'status').items[0].value,
    '19 → 20 °C · Offline',
  );
});

test('the "all off" button sets every heater added to off, with a toast', async () => {
  const world = await createWorld();
  await createAll(world);
  const ack = await world.gladys.fake.widgetAction('overview', 'all_off');
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /4 radiateur\(s\) modifié\(s\)/);
  for (const name of ['Radiateur salon', 'Prise', 'Chambre', 'Mill Gen3']) {
    assert.equal(stateOf(world, discovered(world, name), 'mode'), THERMOSTAT_MODE.OFF, name);
  }
  await world.app.stop();
});

test('scene action set_mode_all: weekly programme everywhere, counts as outputs', async () => {
  const world = await createWorld();
  await createAll(world);
  world.mill.heaters['192.0.2.40'].down = true;
  const ack = await world.gladys.fake.sceneAction('set_mode_all', { mode: 'weekly' });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { changed: 3, failed: 1 });
  assert.equal(stateOf(world, discovered(world, 'Chambre'), 'mode'), THERMOSTAT_MODE.AUTO);
  const unknown = await world.gladys.fake.sceneAction('set_mode_all', { mode: 'turbo' });
  assert.equal(unknown.success, false);
  await world.app.stop();
});
