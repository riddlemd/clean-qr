export const DEFAULTS = Object.freeze({
  theme: "auto",
  size: 200,              // CSS px
  ecLevel: "M",
  stripTracking: true,
  trackingExtra: "",      // additional parameter names, comma or space separated
  contextMenus: true,
  menuPage: true,
  menuLink: true,
  menuImage: true,
  menuSelection: true,
  menuFrame: false,       // only fires inside an iframe, so off until asked for
  autoCopy: false,
  autoCopyFormat: "image",
  // Extra popup buttons, off by default — the popup stays compact and the
  // remaining ones keep their labels readable at a glance.
  actionCopyUrl: false,
  actionFullScreen: false,
  exportFormat: "png",
  pngScale: 2,
  filename: "host",
  selectionDefault: "link",
  textFragments: true,
  fragmentPrecision: "auto",
  countryCode: "",        // prefixed onto local numbers; blank encodes them bare
  density: "balanced",    // how hard to fight QR density; see qr.js CEILINGS
  recentCodes: false,     // records what was encoded, so opt-in
  recentLimit: 10,
});

// A stale or hand-edited stored value would otherwise reach encode()/toCanvas()
// and error on every popup open, with no way to recover from the popup itself.
const VALID = {
  theme: new Set(["auto", "light", "dark"]),
  size: new Set([150, 200, 300]),
  ecLevel: new Set(["L", "M", "Q", "H"]),
  exportFormat: new Set(["png", "svg"]),
  pngScale: new Set([1, 2, 4]),
  autoCopyFormat: new Set(["image", "url"]),
  filename: new Set(["host", "title", "hostDate"]),
  recentLimit: new Set([5, 10, 25, 50]),
  selectionDefault: new Set(["link", "text"]),
  fragmentPrecision: new Set(["auto", "whole", "ends"]),
  density: new Set(["scannable", "balanced", "correction"]),
  trackingExtra: (v) => typeof v === "string" && v.length <= 500,
  countryCode: (v) => typeof v === "string" && /^(\+?\d{1,3})?$/.test(v),
};

const allows = (rule, value) => (typeof rule === "function" ? rule(value) : rule.has(value));

export async function getSettings() {
  const stored = await browser.storage.local.get(Object.keys(DEFAULTS));
  for (const [key, rule] of Object.entries(VALID)) {
    if (key in stored && !allows(rule, stored[key])) delete stored[key];
  }
  return { ...DEFAULTS, ...stored };
}

export async function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting: ${key}`);
  if (key in VALID && !allows(VALID[key], value)) throw new Error(`Invalid ${key}: ${value}`);
  await browser.storage.local.set({ [key]: value });
}

export function onSettingsChanged(callback) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const relevant = Object.keys(changes).filter((k) => k in DEFAULTS);
    if (relevant.length) callback(changes, relevant);
  });
}
