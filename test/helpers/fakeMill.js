// -----------------------------------------------------------------------------
// A simulated Mill: the cloud API and Gen 3 heaters on the local network, behind
// one `fetch`. Answers from the fixtures (test/fixtures/mill), records every
// request, and lets the tests break things: a refused account, a 429, a heater
// unplugged, a device the cloud reports offline.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/mill/${name}`, import.meta.url), 'utf8'));

export const FIXTURES = {
  houses: () => fixture('cloud-houses.json'),
  houseDevices: () => fixture('cloud-house-devices.json'),
  independent: () => fixture('cloud-independent.json'),
  localStatus: () => fixture('local-status.json'),
  localControl: () => fixture('local-control-status.json'),
  localControlExtended: () => fixture('local-control-status-extended.json'),
};

export const CLOUD = 'https://api.millnorwaycloud.com/';
export const ACCOUNT = { username: 'someone@example.com', password: 'correct horse battery' };

/** A JWT the client can read the expiry of (not signed: the client never checks). */
export function fakeJwt(expSeconds, subject = 'user') {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ sub: subject, exp: expSeconds })}.signature`;
}

const json = (status, body) =>
  new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * @param {object} [options]
 * @param {Record<string, { status: object, control: object }>} [options.heaters] local heaters by host
 * @param {() => number} [options.now] clock of the token expiries
 */
export function createFakeMill({ heaters = {}, now = () => Date.now() } = {}) {
  const mill = {
    account: { ...ACCOUNT },
    houses: FIXTURES.houses(),
    houseDevices: FIXTURES.houseDevices(),
    independent: FIXTURES.independent(),
    heaters: Object.fromEntries(
      Object.entries(heaters).map(([host, heater]) => [host, { down: false, ...heater }]),
    ),
    requests: [],
    signIns: 0,
    refreshes: 0,
    tokenLifetimeS: 600,
    issued: new Set(),
    refreshTokens: new Set(),
    failCloud: null, // null | 'rate_limit' | 'server' | 'network'
    cloudDown: false,

    /** All cloud devices, wherever they are (rooms or independent). */
    cloudDevices() {
      return [...this.houseDevices.flatMap((room) => room.devices), ...this.independent.items];
    },

    cloudDevice(deviceId) {
      return this.cloudDevices().find((device) => device.deviceId === deviceId);
    },

    issue() {
      const token = fakeJwt(Math.floor(now() / 1000) + this.tokenLifetimeS, `t${this.issued.size}`);
      const refresh = `refresh-${this.issued.size}`;
      this.issued.add(token);
      this.refreshTokens.add(refresh);
      return { idToken: token, refreshToken: refresh };
    },

    async fetch(url, init = {}) {
      const method = init.method ?? 'GET';
      const body = init.body === undefined ? undefined : JSON.parse(init.body);
      const headers = init.headers ?? {};
      mill.requests.push({ method, url: String(url), body, headers });
      if (String(url).startsWith(CLOUD)) {
        return mill.cloud(method, String(url).slice(CLOUD.length), body, headers);
      }
      const match = String(url).match(/^http:\/\/([^/]+)\/(.*)$/);
      const heater = match && mill.heaters[match[1]];
      if (!heater || heater.down) {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'EHOSTUNREACH' };
        throw err;
      }
      return mill.local(heater, method, match[2], body);
    },

    cloud(method, path, body, headers) {
      if (mill.cloudDown || mill.failCloud === 'network') {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNRESET' };
        throw err;
      }
      if (mill.failCloud === 'rate_limit') {
        return json(429, { error: 'Too many requests' });
      }
      if (mill.failCloud === 'server') {
        return json(503, { error: 'Unavailable' });
      }
      if (method === 'POST' && path === 'customer/auth/sign-in') {
        mill.signIns += 1;
        if (body.login !== mill.account.username || body.password !== mill.account.password) {
          return new Response(
            JSON.stringify({
              error: { type: 'NotAuthorized', message: 'Incorrect login or password' },
            }),
            { status: 401 },
          );
        }
        return json(200, mill.issue());
      }
      const auth = String(headers.authorization ?? '').replace(/^Bearer /, '');
      if (method === 'POST' && path === 'customer/auth/refresh') {
        if (!mill.refreshTokens.has(auth)) {
          return json(401, { error: 'invalid refresh token' });
        }
        mill.refreshes += 1;
        return json(200, mill.issue());
      }
      if (!mill.issued.has(auth)) {
        return json(401, { error: 'Unauthorized' });
      }
      const exp = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString()).exp;
      if (exp * 1000 <= now()) {
        return json(401, { error: 'Token expired' });
      }
      if (method === 'GET' && path === 'houses') {
        return json(200, mill.houses);
      }
      let m = path.match(/^houses\/([^/]+)\/devices$/);
      if (method === 'GET' && m) {
        return json(200, mill.houseDevices);
      }
      m = path.match(/^houses\/([^/]+)\/devices\/independent$/);
      if (method === 'GET' && m) {
        return json(200, mill.independent);
      }
      m = path.match(/^devices\/([^/]+)\/settings$/);
      if (method === 'PATCH' && m) {
        const device = mill.cloudDevice(decodeURIComponent(m[1]));
        if (!device) {
          return json(404, { error: 'Not found' });
        }
        const settings = body.settings ?? {};
        device.deviceSettings.reported = { ...device.deviceSettings.reported, ...settings };
        if (settings.temperature_normal !== undefined) {
          device.lastMetrics.temperature = settings.temperature_normal;
        }
        if (settings.operation_mode !== undefined) {
          device.lastMetrics.powerStatus = settings.operation_mode === 'off' ? 0 : 1;
        }
        return json(200, { ok: true });
      }
      return json(404, { error: `no route ${method} ${path}` });
    },

    local(heater, method, path, body) {
      if (method === 'GET' && path === 'status') {
        return json(200, heater.status);
      }
      if (method === 'GET' && path === 'control-status') {
        return json(200, heater.control);
      }
      if (method === 'POST' && path === 'set-temperature') {
        heater.control.set_temperature = body.value;
        return json(200, { status: 'ok' });
      }
      if (method === 'POST' && path === 'operation-mode') {
        heater.control.operation_mode = body.mode;
        return json(200, { status: 'ok' });
      }
      return json(404, { status: 'Not found' });
    },

    /** Cloud requests, without the auth ones. */
    cloudReads() {
      return mill.requests.filter(
        (r) => r.url.startsWith(CLOUD) && !r.url.includes('customer/auth'),
      );
    },
  };
  mill.fetch = mill.fetch.bind(mill);
  return mill;
}

/** One Gen 3 heater for the local network. */
export const localHeater = ({ extended = false, mac } = {}) => {
  const status = FIXTURES.localStatus();
  if (mac) {
    status.mac_address = mac;
  }
  return {
    status,
    control: extended ? FIXTURES.localControlExtended() : FIXTURES.localControl(),
  };
};
