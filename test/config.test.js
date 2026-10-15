import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, parseHosts } from '../src/config.js';

test('defaults: nothing configured, French names, one-minute cloud refresh', () => {
  const config = normalizeConfig();
  assert.equal(config.language, 'fr');
  assert.equal(config.refreshIntervalS, 60);
  assert.equal(config.preferLocal, true);
  assert.deepEqual(config.hosts, []);
  assert.equal(isConfigured(config), false);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('values are typed and bounded', () => {
  const config = normalizeConfig({
    username: '  me@example.com ',
    password: 'p',
    refresh_interval: '300',
    language: 'de',
    GLADYS_PREFER_LOCAL: false,
  });
  assert.equal(config.username, 'me@example.com');
  assert.equal(config.refreshIntervalS, 300);
  assert.equal(config.language, 'de');
  assert.equal(config.preferLocal, false);
  assert.equal(isConfigured(config), true);
  assert.equal(normalizeConfig({ refresh_interval: '5' }).refreshIntervalS, 60);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('local addresses: separators, schemes and duplicates; invalid ones set aside', () => {
  assert.deepEqual(parseHosts('192.0.2.40, http://192.0.2.41/ ;192.0.2.40\nmill-bureau.lan:80'), {
    hosts: ['192.0.2.40', '192.0.2.41', 'mill-bureau.lan:80'],
    invalidHosts: [],
  });
  assert.deepEqual(parseHosts('user:pass@192.0.2.1, 192.0.2.40/status, ok.lan'), {
    hosts: ['ok.lan'],
    invalidHosts: ['user:pass@192.0.2.1', '192.0.2.40/status'],
  });
  assert.deepEqual(parseHosts(''), { hosts: [], invalidHosts: [] });
});
