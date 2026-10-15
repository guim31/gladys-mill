// -----------------------------------------------------------------------------
// Errors of the Mill clients. Their messages are shown to the user (status of
// the Configuration screen, action results) and written to the logs: they
// never carry a password, a token or a response body.
// -----------------------------------------------------------------------------

/** The Mill cloud refused the e-mail address or the password. */
export class MillAuthError extends Error {
  constructor(message = 'Mill account refused: check the e-mail address and the password') {
    super(message);
    this.name = 'MillAuthError';
    this.code = 'auth';
  }
}

/** The Mill cloud answered 429: too many requests. */
export class MillRateLimitError extends Error {
  constructor() {
    super('Mill cloud: too many requests (HTTP 429), slowing down');
    this.name = 'MillRateLimitError';
    this.code = 'rate_limit';
  }
}

/** Any other HTTP status, a timeout or a network error. */
export class MillHttpError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status) {
    super(message);
    this.name = 'MillHttpError';
    this.code = 'http';
    this.status = status;
  }
}

/**
 * Describe a fetch failure without its URL (a local URL is an address of the
 * user's network, a cloud URL may carry ids): the cause only.
 * @param {unknown} err
 */
export function networkReason(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return 'no answer (timeout)';
  }
  const code = err?.cause?.code;
  if (code) {
    return `network error (${code})`;
  }
  return 'network error';
}
