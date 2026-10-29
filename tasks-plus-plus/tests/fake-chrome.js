// A stand-in for the parts of the `chrome` extension API the side panel uses,
// so its page can run in a plain browser tab. Storage lives in memory, starts
// from `seed` ({ local, sync }) and fires onChanged like the real thing.
//
// Runs in the page (via page.addInitScript), so it must be self-contained.
export function installFakeChrome(seed) {
  const listeners = [];
  const event = (list) => ({
    addListener: (listener) => list.push(listener),
    removeListener: (listener) => list.splice(list.indexOf(listener), 1),
  });

  function storageArea(areaName, initial) {
    const data = structuredClone(initial);
    return {
      async get(keys) {
        if (keys == null) return structuredClone(data);
        const defaults =
          typeof keys === 'string' ? { [keys]: undefined }
          : Array.isArray(keys) ? Object.fromEntries(keys.map((key) => [key, undefined]))
          : keys;
        const result = {};
        for (const [key, fallback] of Object.entries(defaults)) {
          const value = key in data ? data[key] : fallback;
          if (value !== undefined) result[key] = structuredClone(value);
        }
        return result;
      },
      async set(items) {
        const changes = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
          data[key] = structuredClone(value);
        }
        for (const listener of [...listeners]) listener(structuredClone(changes), areaName);
      },
      async remove(keys) {
        const changes = {};
        for (const key of [keys].flat()) {
          if (!(key in data)) continue;
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        if (Object.keys(changes).length) {
          for (const listener of [...listeners]) listener(structuredClone(changes), areaName);
        }
      },
    };
  }

  window.chrome = {
    storage: {
      local: storageArea('local', seed.local ?? {}),
      sync: storageArea('sync', seed.sync ?? {}),
      onChanged: event(listeners),
    },
    windows: {
      getCurrent: async () => ({ id: 1 }),
    },
    runtime: {
      connect: () => ({ onMessage: event([]), onDisconnect: event([]), postMessage() {} }),
      sendMessage: async (message) => (message?.type === 'PING' ? { type: 'PONG' } : undefined),
      openOptionsPage() {},
    },
  };
}
