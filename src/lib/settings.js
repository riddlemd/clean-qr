export const DEFAULTS = Object.freeze({
  theme: "auto",          // auto | light | dark
  size: 200,              // QR display edge in CSS px
  ecLevel: "M",           // L | M | Q | H
  stripTracking: true,
  contextMenus: true,
  autoCopy: false,
  exportFormat: "png",    // png | svg
  pngScale: 2,            // 1 | 2 | 4
});

export async function getSettings() {
  const stored = await browser.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting: ${key}`);
  await browser.storage.local.set({ [key]: value });
}

export function onSettingsChanged(callback) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const relevant = Object.keys(changes).filter((k) => k in DEFAULTS);
    if (relevant.length) callback(changes, relevant);
  });
}
