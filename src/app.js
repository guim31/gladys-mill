// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake) and
// returns the hub, so index.js stays a few lines and the tests drive the very
// same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { MillHub } from './hub.js';
import { MESSAGES, REPORT } from './i18n.js';
import { SCENE_ACTIONS } from './scenes.js';
import { Store } from './store.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'mill-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, fetch, now, timers, timings
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new MillHub({
    gladys,
    store: options.store ?? new Store(),
    fetch: options.fetch,
    now: options.now,
    timers: options.timers ?? true,
    timings: options.timings,
  });

  // Resolved once the hub has started: a command arriving during the first
  // read waits for it instead of failing on an unknown device.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        await hub.resync(config);
        return;
      }
      started = true;
      logger.info('Starting the Mill integration');
      await hub.start(config);
    } catch (err) {
      logger.error(`Initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.rediscover()));
  gladys.onSetValue(whenReady((device, feature, value) => hub.setValue(device, feature, value)));
  gladys.onPoll(whenReady((device) => hub.poll(device)));
  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onConfigUpdated(whenReady((config) => hub.reconfigure(normalizeConfig(config))));

  gladys.onAction(
    'test_connection',
    whenReady(async () => {
      logger.info('Action: test the connection');
      return connectionReport(await hub.testConnection());
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => {
        logger.info(`Scene action ${key}`);
        return handler(hub, { fields });
      }),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params) => {
        logger.info(`Widget action ${actionKey}`);
        return widget.action(hub, { actionKey, params });
      }),
    );
  }

  return { hub, ready, stop: () => hub.stop() };
}

/** The report shown under the "Test the connection" button, in every language. */
export function connectionReport({ cloud, locals, invalidHosts = [] }) {
  return Object.fromEntries(
    Object.entries(REPORT).map(([lang, text]) => {
      const lines = [];
      if (!cloud) {
        lines.push(text.cloudOff);
      } else if (cloud.ok) {
        lines.push(text.cloudOk(cloud.count));
      } else if (cloud.auth) {
        lines.push(text.cloudAuth);
      } else {
        lines.push(text.cloudError(MESSAGES.cloudUnreachable[lang].replace(/\.$/, '')));
      }
      if (locals.length === 0) {
        lines.push(text.localOff);
      }
      for (const local of locals) {
        lines.push(
          local.ok
            ? text.localOk(local.host, local.name)
            : text.localError(local.host, local.reason),
        );
      }
      if (invalidHosts.length > 0) {
        lines.push(text.ignored(invalidHosts.slice(0, 3).join(', ')));
      }
      return [lang, lines.join(' ')];
    }),
  );
}
