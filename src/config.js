// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` of the manifest; this module
// gives the defaults and normalizes what Gladys sends, so the rest of the code
// never deals with `undefined` or with a number typed as a string.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh pace of the Mill cloud, in seconds. The Mill cloud answers 429 when
// it is asked too often: one minute is the fastest offered (Home Assistant
// reads it every 30 s, with caches in front of most calls).
export const CLOUD_INTERVALS = [60, 120, 300];

// The local API of a Gen 3 heater is read every 30 s: it is the heater itself,
// on the LAN, with no quota.
export const LOCAL_INTERVAL_S = 30;

// Defaults: they MUST stay equal to the `default` values of the manifest
// (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  local_hosts: '',
  refresh_interval: '60',
  language: 'fr',
  // Reserved key (NOT in config_schema): the manifest declares both 'cloud'
  // and 'local' transports, so Gladys shows a "Prefer the local connection"
  // toggle and sends the user's choice here. Read-only for the integration.
  GLADYS_PREFER_LOCAL: true,
};

/**
 * Merge the user config with the defaults, and type it.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const interval = Number(raw.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  const { hosts, invalidHosts } = parseHosts(raw.local_hosts ?? DEFAULT_CONFIG.local_hosts);
  return {
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    hosts,
    invalidHosts,
    refreshIntervalS: CLOUD_INTERVALS.includes(interval) ? interval : CLOUD_INTERVALS[0],
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    preferLocal: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

/** The cloud is used once both credentials are filled in. */
export function hasCloud(config) {
  return Boolean(config.username && config.password);
}

/** Nothing to talk to yet: neither an account nor a local address. */
export function isConfigured(config) {
  return hasCloud(config) || config.hosts.length > 0;
}

// A host name or an IPv4 address, with an optional port. No scheme, no path,
// no credentials: the local API is plain HTTP on the heater itself.
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i;

/**
 * Split the "Local addresses" field: commas, semicolons, spaces or new lines.
 * Users paste `http://192.0.2.10/` as often as `192.0.2.10`: both are kept.
 * @param {unknown} value
 * @returns {{ hosts: string[], invalidHosts: string[] }}
 */
export function parseHosts(value) {
  const hosts = [];
  const invalidHosts = [];
  for (const token of String(value).split(/[\s,;]+/)) {
    const host = token
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    if (host === '') {
      continue;
    }
    if (HOST.test(host) && !host.includes('@')) {
      if (!hosts.includes(host)) {
        hosts.push(host);
      }
    } else {
      invalidHosts.push(token.trim());
    }
  }
  return { hosts, invalidHosts };
}
