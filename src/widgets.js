// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// `overview`: every Mill heater added to Gladys on one card — the measured
// temperature, the set-point and what the heater does — with the total power
// and two buttons for the whole house (back to the weekly programme, all
// off). The per-heater controls stay the core's thermostat widgets.
//
// Budget of the core: 8 components, 2 texts, 6 tiles, 1 status list of 10
// rows, 4 buttons. Texts are localized here from the request language (the
// core caches the content per language).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { THERMOSTAT_MODE } from './constants.js';
import { WIDGET_TEXT, fill } from './i18n.js';
import { LANGUAGES } from './config.js';
import { WIDGET_KEY } from './hub.js';

const MAX_ROWS = 10;

const pick = (text, language) => text[language] ?? text.en;

const formatTemp = (value) =>
  value === undefined ? '–' : `${Number(value).toFixed(1).replace(/\.0$/, '')}`;

/** One status row: "20.5 → 21 °C · Heating". */
function row(snapshot, language) {
  const { values } = snapshot;
  let state;
  let color;
  if (snapshot.reachable === false) {
    state = pick(WIDGET_TEXT.offline, language);
    color = WIDGET_COLORS.DANGER;
  } else if (values.mode === THERMOSTAT_MODE.OFF) {
    state = pick(WIDGET_TEXT.off, language);
    color = WIDGET_COLORS.NEUTRAL;
  } else if (values.heating === 1) {
    state = pick(WIDGET_TEXT.heating, language);
    color = WIDGET_COLORS.WARNING;
  } else {
    state = pick(WIDGET_TEXT.idle, language);
    color = WIDGET_COLORS.SUCCESS;
  }
  const temps = `${formatTemp(values.temperature)} → ${formatTemp(values.target)} °C`;
  return {
    label: snapshot.name.slice(0, 40),
    value: `${temps} · ${state}`.slice(0, 40),
    color,
  };
}

/**
 * The content of the widget.
 * @param {Array<object>} snapshots heaters and sockets added to Gladys
 * @param {string} language
 */
export function buildOverview(snapshots, language) {
  const lang = LANGUAGES.includes(language) ? language : 'en';
  if (snapshots.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: pick(WIDGET_TEXT.empty, lang) }],
    };
  }
  const reachable = snapshots.filter((s) => s.reachable !== false);
  const heating = reachable.filter((s) => s.values.heating === 1).length;
  const powers = reachable.map((s) => s.values.power).filter((value) => value !== undefined);
  const components = [];
  if (powers.length > 0) {
    components.push({
      type: 'value',
      label: pick(WIDGET_TEXT.power, lang),
      value: Math.round(powers.reduce((sum, value) => sum + value, 0)),
      unit: 'W',
      icon: 'zap',
    });
  }
  components.push({
    type: 'value',
    label: pick(WIDGET_TEXT.heating, lang),
    value: `${heating}/${snapshots.length}`,
    icon: 'thermometer',
    color: heating > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  });
  components.push({
    type: 'status',
    items: [...snapshots]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS)
      .map((snapshot) => row(snapshot, lang)),
  });
  components.push(
    {
      type: 'button',
      label: pick(WIDGET_TEXT.allWeekly, lang),
      icon: 'calendar',
      style: 'secondary',
      action: { key: 'all_weekly' },
    },
    {
      type: 'button',
      label: pick(WIDGET_TEXT.allOff, lang),
      icon: 'power',
      style: 'secondary',
      action: { key: 'all_off', confirm: true },
    },
  );
  return { ttl_seconds: 60, components };
}

const ACTION_MODES = {
  all_weekly: THERMOSTAT_MODE.AUTO,
  all_off: THERMOSTAT_MODE.OFF,
};

export const WIDGETS = {
  [WIDGET_KEY]: {
    /** @param {import('./hub.js').MillHub} hub */
    async get(hub, { language }) {
      return buildOverview(
        hub.createdThermostats().map(([, snapshot]) => snapshot),
        language,
      );
    },

    async action(hub, { actionKey }) {
      const mode = ACTION_MODES[actionKey];
      if (mode === undefined) {
        throw new Error(`Unknown action: ${actionKey}`);
      }
      const { changed, failed } = await hub.setModeAll(mode);
      return failed > 0
        ? fill(WIDGET_TEXT.partial, { count: changed, failed })
        : fill(WIDGET_TEXT.done, { count: changed });
    },
  },
};
