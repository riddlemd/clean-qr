// Minimal browser.* stub. Install before importing any src module — caps.js and
// background.js read the global at import time.
export function installBrowserStub() {
  const local = new Map();
  const session = new Map();
  const listeners = { storageChanged: [], menusClicked: [] };
  const calls = { menus: [] };

  const area = (map) => ({
    async get(key) {
      const keys = Array.isArray(key) ? key : [key];
      const out = {};
      for (const k of keys) if (map.has(k)) out[k] = map.get(k);
      return out;
    },
    async set(entries) {
      for (const [k, v] of Object.entries(entries)) map.set(k, v);
    },
    async remove(key) {
      map.delete(key);
    },
  });

  globalThis.browser = {
    storage: {
      local: area(local),
      session: area(session),
      onChanged: { addListener: (fn) => listeners.storageChanged.push(fn) },
    },
    menus: {
      async removeAll() {
        calls.menus.push("removeAll");
      },
      create(opts) {
        calls.menus.push(`create:${opts.id}`);
      },
      onClicked: { addListener: (fn) => listeners.menusClicked.push(fn) },
    },
    runtime: {
      getURL: (path) => `moz-extension://stub/${path}`,
    },
    tabs: {
      async create() {},
    },
  };

  const emitStorageChange = (changes, areaName = "local") => {
    for (const fn of listeners.storageChanged) fn(changes, areaName);
  };

  return { local, session, listeners, calls, emitStorageChange };
}
