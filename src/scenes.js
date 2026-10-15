// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// `set_mode_all`: one mode for every Mill heater added to Gladys — "I leave:
// everything back to the weekly programme", "summer: everything off" — in one
// card instead of one per heater. Its outputs say how many heaters changed,
// for a following notification or condition.
// -----------------------------------------------------------------------------

import { THERMOSTAT_MODE } from './constants.js';

export const SCENE_MODES = {
  off: THERMOSTAT_MODE.OFF,
  individual: THERMOSTAT_MODE.HEATING,
  weekly: THERMOSTAT_MODE.AUTO,
};

export const SCENE_ACTIONS = {
  /**
   * @param {import('./hub.js').MillHub} hub
   * @param {{ fields: { mode?: string } }} request
   */
  async set_mode_all(hub, { fields }) {
    const mode = SCENE_MODES[fields.mode ?? 'weekly'];
    if (mode === undefined) {
      throw new Error(`Unknown mode: ${fields.mode}`);
    }
    const { changed, failed } = await hub.setModeAll(mode);
    return { changed, failed };
  },
};
