// -----------------------------------------------------------------------------
// Client of the local API of the Mill Gen 3 heaters, after the open-source
// library `mill-local` (Danielhiversen, MIT) used by Home Assistant:
//
//   GET  http://<ip>/status          → { name, mac_address, version, operation_key, status }
//   GET  http://<ip>/control-status  → { ambient_temperature, set_temperature,
//                                        current_power, control_signal,
//                                        raw_ambient_temperature, operation_mode, ... }
//   POST http://<ip>/set-temperature { type: 'Normal', value }
//   POST http://<ip>/operation-mode  { mode: 'Control individually' | 'Weekly program' | 'OFF' }
//
// Plain HTTP on the LAN, no authentication: the local API must be enabled in
// the Mill app. The body of a POST is JSON sent without a content type, as
// mill-local does (the heater does not need one).
// -----------------------------------------------------------------------------

import { MillHttpError, networkReason } from './errors.js';

const TIMEOUT_MS = 10000;

export const LOCAL_MODES = {
  INDIVIDUAL: 'Control individually',
  WEEKLY: 'Weekly program',
  OFF: 'OFF',
  INDEPENDENT: 'Independent device',
};

export class MillLocal {
  /**
   * @param {string} host IP address or host name, optional port
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]
   */
  constructor(host, { fetch = globalThis.fetch } = {}) {
    this.host = host;
    this.fetch = fetch;
  }

  async call(method, path, body) {
    let response;
    try {
      response = await this.fetch(`http://${this.host}/${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new MillHttpError(`local heater: ${networkReason(err)}`);
    }
    const text = await response.text().catch(() => '');
    let data;
    try {
      data = text === '' ? null : JSON.parse(text);
    } catch {
      throw new MillHttpError('local heater: unreadable answer (is it a Mill Gen 3 heater?)');
    }
    if (!response.ok) {
      throw new MillHttpError(`local heater: HTTP ${response.status}`, response.status);
    }
    return data;
  }

  /** Identity of the heater: name, MAC address, firmware. */
  async status() {
    const data = await this.call('GET', 'status');
    if (!data || typeof data !== 'object' || !data.mac_address) {
      throw new MillHttpError(
        'local heater: no MAC address in /status (is the local API enabled?)',
      );
    }
    return data;
  }

  /** Current readings and settings. */
  async controlStatus() {
    const data = await this.call('GET', 'control-status');
    if (!data || typeof data !== 'object') {
      throw new MillHttpError('local heater: empty /control-status');
    }
    return data;
  }

  setTemperature(value) {
    return this.call('POST', 'set-temperature', { type: 'Normal', value });
  }

  setMode(mode) {
    return this.call('POST', 'operation-mode', { mode });
  }
}
