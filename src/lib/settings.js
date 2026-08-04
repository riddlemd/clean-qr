export const DEFAULTS = Object.freeze({
  theme: "auto",
  size: 200,              // CSS px
  ecLevel: "M",
  stripTracking: true,
  contextMenus: true,
  autoCopy: false,
  exportFormat: "png",
  pngScale: 2,
});

// A stale or hand-edited stored value would otherwise reach encode()/toCanvas()
// and error on every popup open, with no way to recover from the popup itself.
const VALID = {
  theme: new Set(["auto", "light", "dark"]),
  size: new Set([150, 200, 300]),
  ecLevel: new Set(["L", "M", "Q", "H"]),
  exportFormat: new Set(["png", "svg"]),
  pngScale: new Set([1, 2, 4]),
};

export async function getSettings() {
  const stored = await browser.storage.local.get(Object.keys(DEFAULTS));
  for (const [key, allowed] of Object.entries(VALID)) {
    if (key in stored && !allowed.has(stored[key])) delete stored[key];
  }
  return { ...DEFAULTS, ...stored };
}

export async function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting: ${key}`);
  if (key in VALID && !VALID[key].has(value)) throw new Error(`Invalid ${key}: ${value}`);
  await browser.storage.local.set({ [key]: value });
}

export function onSettingsChanged(callback) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const relevant = Object.keys(changes).filter((k) => k in DEFAULTS);
    if (relevant.length) callback(changes, relevant);
  });
}
