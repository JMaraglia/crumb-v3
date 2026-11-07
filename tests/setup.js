// Test setup: a fake phone storage (localStorage) and a bare `window`, reset before every test.
// Tests never touch real data: this runs only on the build machine, with made-up records.
import { beforeEach } from 'vitest';

class FakeStorage {
  constructor() {
    this.m = new Map();
    this.full = false; // set true to act like a phone that's out of space
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    if (this.full) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  globalThis.localStorage = new FakeStorage();
  globalThis.window = { dispatchEvent: () => true, crypto: globalThis.crypto };
  if (typeof globalThis.Event === 'undefined') globalThis.Event = class { constructor(t) { this.type = t; } };
});
