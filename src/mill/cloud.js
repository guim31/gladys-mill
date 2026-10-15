// -----------------------------------------------------------------------------
// Client of the Mill cloud (the API of the Mill app), after the open-source
// library `millheater` (Danielhiversen/pymill, MIT) used by Home Assistant.
//
//   POST  customer/auth/sign-in        { login, password } → { idToken, refreshToken }
//   POST  customer/auth/refresh        Bearer <refreshToken> → { idToken, refreshToken }
//   GET   houses                       → { ownHouses: [{ id, name }] }
//   GET   houses/<id>/devices          → [{ roomId, roomName, devices: [device] }]
//   GET   houses/<id>/devices/independent → { items: [device] }
//   PATCH devices/<id>/settings        { deviceType, enabled, settings }
//
// The id token lives about ten minutes (its JWT `exp`), the refresh token much
// longer: both are kept in /data, tied to a hash of the account e-mail, so a
// restart refreshes instead of signing in again. A 401 refreshes once, then
// signs in once; a refused sign-in is a MillAuthError, never retried in a loop
// (the poller backs off, the user fixes the password).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { MillAuthError, MillHttpError, MillRateLimitError, networkReason } from './errors.js';

export const CLOUD_API = 'https://api.millnorwaycloud.com/';

// The houses and their ids change when the user edits the Mill app: read them
// again every half hour (millheater caches them 20 minutes).
const HOUSES_TTL_MS = 30 * 60 * 1000;
// Fallback lifetime when the token carries no readable `exp` (millheater: 10 min).
const DEFAULT_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
// Refresh a little before the expiry, not on the 401.
const EXPIRY_MARGIN_MS = 60 * 1000;
const TIMEOUT_MS = 15000;

/** Hash of the account e-mail: ties the saved tokens to the account. */
export const accountHash = (username) =>
  createHash('sha256').update(String(username).trim().toLowerCase()).digest('hex').slice(0, 16);

/**
 * Expiry date (ms) of a JWT, read without verifying it (only to know when to
 * refresh it); undefined when unreadable.
 * @param {string} token
 */
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export class MillCloud {
  /**
   * @param {object} options
   * @param {string} options.username
   * @param {string} options.password
   * @param {import('../store.js').Store} [options.store] where the tokens are kept
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   */
  constructor({ username, password, store, fetch = globalThis.fetch, now = () => Date.now() }) {
    this.username = username;
    this.password = password;
    this.store = store;
    this.fetch = fetch;
    this.now = now;
    this.account = accountHash(username);
    this.tokens = null;
    this.houses = null;
    this.housesAt = 0;
    // One sign-in or refresh at a time: the poll and a command may both need one.
    this.authenticating = null;

    const saved = store?.get('cloud');
    if (saved && saved.account === this.account && saved.refreshToken) {
      this.tokens = {
        accessToken: saved.accessToken,
        refreshToken: saved.refreshToken,
        expiresAt: saved.expiresAt ?? 0,
      };
    }
  }

  /** Low-level call, no authentication logic. */
  async call(method, path, { body, token } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    let response;
    try {
      response = await this.fetch(`${CLOUD_API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new MillHttpError(`Mill cloud: ${networkReason(err)}`);
    }
    const text = await response.text().catch(() => '');
    let data;
    try {
      data = text === '' ? null : JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { status: response.status, ok: response.ok, data, text };
  }

  async ensureToken() {
    if (this.tokens?.accessToken && this.tokens.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
      return this.tokens.accessToken;
    }
    return this.authenticate(Boolean(this.tokens?.refreshToken));
  }

  /** Refresh (when possible) or sign in; shared by concurrent callers. */
  authenticate(tryRefresh = true) {
    if (!this.authenticating) {
      this.authenticating = (async () => {
        try {
          if (tryRefresh && this.tokens?.refreshToken) {
            const refreshed = await this.refresh().catch(() => null);
            if (refreshed) {
              return refreshed;
            }
          }
          return await this.signIn();
        } finally {
          this.authenticating = null;
        }
      })();
    }
    return this.authenticating;
  }

  async signIn() {
    const res = await this.call('POST', 'customer/auth/sign-in', {
      body: { login: this.username, password: this.password },
    });
    if (res.status === 429) {
      throw new MillRateLimitError();
    }
    if (/incorrect login or password/i.test(res.text) || res.status === 401) {
      throw new MillAuthError();
    }
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        throw new MillAuthError(`Mill account refused (HTTP ${res.status})`);
      }
      throw new MillHttpError(`Mill cloud: sign-in failed (HTTP ${res.status})`, res.status);
    }
    return this.keepTokens(res.data);
  }

  /** @returns {Promise<string|null>} the new access token, null when refused */
  async refresh() {
    const res = await this.call('POST', 'customer/auth/refresh', {
      token: this.tokens.refreshToken,
    });
    if (res.status === 429) {
      throw new MillRateLimitError();
    }
    if (!res.ok || !res.data?.idToken) {
      return null;
    }
    return this.keepTokens(res.data);
  }

  async keepTokens(data) {
    if (!data?.idToken || !data?.refreshToken) {
      throw new MillHttpError('Mill cloud: sign-in answer without token');
    }
    this.tokens = {
      accessToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: tokenExpiry(data.idToken) ?? this.now() + DEFAULT_TOKEN_LIFETIME_MS,
    };
    await this.store?.set('cloud', { account: this.account, ...this.tokens });
    return this.tokens.accessToken;
  }

  /** Authenticated call: a 401 renews the token once and retries. */
  async request(method, path, body) {
    let token = await this.ensureToken();
    let res = await this.call(method, path, { body, token });
    if (res.status === 401) {
      this.tokens = { ...this.tokens, accessToken: null, expiresAt: 0 };
      token = await this.authenticate(true);
      res = await this.call(method, path, { body, token });
    }
    if (res.status === 429) {
      throw new MillRateLimitError();
    }
    if (res.status === 401 || res.status === 403) {
      throw new MillAuthError(`Mill cloud refused the session (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new MillHttpError(`Mill cloud: HTTP ${res.status}`, res.status);
    }
    if (res.data === undefined) {
      throw new MillHttpError('Mill cloud: unreadable answer');
    }
    return res.data;
  }

  /** Sign in (or refresh) now: the connection test. */
  async connect() {
    await this.ensureToken();
    return true;
  }

  async listHouses() {
    if (this.houses && this.now() - this.housesAt < HOUSES_TTL_MS) {
      return this.houses;
    }
    const data = await this.request('GET', 'houses');
    this.houses = (data?.ownHouses ?? [])
      .filter((house) => house && house.id)
      .map((house) => ({ id: String(house.id), name: house.name ?? '' }));
    this.housesAt = this.now();
    return this.houses;
  }

  /**
   * Every device of every house, with its room.
   * @returns {Promise<Array<{ device: object, room: { id: string, name: string } | null, house: { id: string, name: string } }>>}
   */
  async listDevices() {
    const entries = [];
    for (const house of await this.listHouses()) {
      const rooms = await this.request('GET', `houses/${encodeURIComponent(house.id)}/devices`);
      for (const room of Array.isArray(rooms) ? rooms : []) {
        if (!room || typeof room !== 'object') {
          continue;
        }
        const roomInfo = room.roomId
          ? { id: String(room.roomId), name: room.roomName ?? room.name ?? '' }
          : null;
        for (const device of room.devices ?? []) {
          entries.push({ device, room: roomInfo, house });
        }
      }
      const independent = await this.request(
        'GET',
        `houses/${encodeURIComponent(house.id)}/devices/independent`,
      );
      for (const device of independent?.items ?? []) {
        entries.push({ device, room: null, house });
      }
    }
    return entries.filter(({ device }) => device && device.deviceId);
  }

  /**
   * Change settings of a heater or a socket.
   * @param {string} deviceId
   * @param {string} deviceType 'Heaters' | 'Sockets' (the parent type name)
   * @param {object} settings e.g. { operation_mode: 'control_individually', temperature_normal: 21 }
   */
  async setSettings(deviceId, deviceType, settings) {
    return this.request('PATCH', `devices/${encodeURIComponent(deviceId)}/settings`, {
      deviceType,
      enabled: true,
      settings,
    });
  }

  /** Forget the houses: the next listing reads them again. */
  forgetHouses() {
    this.houses = null;
  }
}
