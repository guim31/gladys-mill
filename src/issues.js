// -----------------------------------------------------------------------------
// Repeated failures, logged once.
//
// A cloud that refuses every minute, a heater unplugged for the summer: each
// would write the same warning again and again. An issue log keeps, per key,
// whether the problem is ongoing: the first failure is a warning, the next
// ones go to debug, and the recovery is one info line.
// -----------------------------------------------------------------------------

/**
 * @param {{ debug: Function, info: Function, warn: Function }} logger
 */
export function createIssueLog(logger) {
  const ongoing = new Set();
  return {
    /**
     * @param {string} key one key per independent problem
     * @param {string} message
     * @returns {boolean} true on the first failure (the problem just started)
     */
    fail(key, message) {
      if (ongoing.has(key)) {
        logger.debug(`${message} (still failing)`);
        return false;
      }
      ongoing.add(key);
      logger.warn(message);
      return true;
    },

    /**
     * @param {string} key
     * @param {string} message said on recovery only
     * @returns {boolean} true when it ends an ongoing failure
     */
    ok(key, message) {
      if (ongoing.delete(key)) {
        logger.info(message);
        return true;
      }
      return false;
    },

    isFailing(key) {
      return ongoing.has(key);
    },
  };
}
