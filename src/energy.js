// -----------------------------------------------------------------------------
// Energy index of the cloud heaters and sockets.
//
// The Mill cloud gives the energy of the current day (energyUsageForCurrentDay,
// back to 0 every night), not a meter index. The energy monitoring of Gladys
// needs a counter that only grows: this module counts one, from the daily
// value, and keeps it in /data so a restart does not reset it.
//
//   - the daily value grows → the index grows by the difference;
//   - the daily value falls (a new day) → the index grows by the new value.
// What the heater consumed between the last reading of a day and midnight is
// lost (one refresh interval at most), as is a day the container was stopped.
// The index starts at the daily value of the first reading.
// -----------------------------------------------------------------------------

// The index is saved at most every 10 minutes (and at shutdown): no SD card
// write on every refresh.
const SAVE_EVERY_MS = 10 * 60 * 1000;

export class EnergyCounter {
  /**
   * @param {import('./store.js').Store} store
   * @param {() => number} [now]
   */
  constructor(store, now = () => Date.now()) {
    this.store = store;
    this.now = now;
    this.counters = { ...(store.get('energy') ?? {}) };
    this.dirty = false;
    this.savedAt = now();
  }

  /**
   * Account a new daily reading of a device.
   * @param {string} deviceKey stable key (source:platformId)
   * @param {number} today energy of the day, kWh
   * @returns {number} the index, kWh
   */
  update(deviceKey, today) {
    const previous = this.counters[deviceKey];
    let counter;
    if (!previous) {
      counter = { today, index: today };
    } else if (today >= previous.today) {
      counter = { today, index: previous.index + (today - previous.today) };
    } else {
      counter = { today, index: previous.index + today };
    }
    counter.index = Number(counter.index.toFixed(3));
    if (!previous || previous.index !== counter.index || previous.today !== today) {
      this.counters[deviceKey] = counter;
      this.dirty = true;
    }
    if (this.dirty && this.now() - this.savedAt >= SAVE_EVERY_MS) {
      this.save().catch(() => {});
    }
    return counter.index;
  }

  /** Write the counters when they changed. */
  async save() {
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    this.savedAt = this.now();
    await this.store.set('energy', { ...this.counters });
  }
}
