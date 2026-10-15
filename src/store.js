// -----------------------------------------------------------------------------
// The integration's own state, kept in /data (the only writable volume of the
// container): the Mill cloud tokens, so a restart does not sign in again, and
// the energy index of each heater (see src/energy.js).
//
// One JSON file, rewritten whole through a temporary file and a rename, so a
// container stopped mid-write never leaves half a file. Writes are chained:
// two quick saves land in order.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class Store {
  /**
   * @param {string} [dir] directory of the file (/data in the container)
   * @param {string} [name]
   */
  constructor(dir = '/data', name = 'mill.json') {
    this.path = join(dir, name);
    this.dir = dir;
    this.data = {};
    this.loaded = false;
    this.writing = Promise.resolve();
  }

  /** Read the file once; a missing or broken file starts empty. */
  async load() {
    if (this.loaded) {
      return this.data;
    }
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      this.data = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.data = {};
    }
    this.loaded = true;
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  /** Set a key and save the whole file (resolves once written). */
  set(key, value) {
    if (value === undefined) {
      delete this.data[key];
    } else {
      this.data[key] = value;
    }
    return this.save();
  }

  save() {
    const text = JSON.stringify(this.data);
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        const tmp = `${this.path}.tmp`;
        await writeFile(tmp, text, { mode: 0o600 });
        await rename(tmp, this.path);
      });
    return this.writing;
  }

  /** Resolves once the last write is on disk (shutdown). */
  flush() {
    return this.writing.catch(() => {});
  }
}
