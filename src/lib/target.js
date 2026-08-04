// Dropping these shortens the encoded string, which directly lowers the QR
// version and makes the code easier to scan. Prefixes are matched too, which is
// what catches the open-ended utm_* and mc_* families.
const TRACKING_EXACT = new Set([
  "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid",
  "msclkid", "twclid", "igshid", "igsh", "ttclid", "li_fat_id",
  "yclid", "_openstat", "vero_id", "vero_conv", "wickedid",
  "s_kwcid", "ef_id", "epik", "mkt_tok", "oly_anon_id", "oly_enc_id",
  "hsa_acc", "hsa_cam", "hsa_grp", "hsa_ad", "hsa_src", "hsa_tgt",
  "hsa_kw", "hsa_mt", "hsa_net", "hsa_ver", "_hsenc", "_hsmi",
  "ref_src", "ref_url", "spm", "scm",
]);

const TRACKING_PREFIXES = ["utm_", "mc_", "pk_", "piwik_", "matomo_", "at_", "ga_", "vero_"];

export const TARGET_KINDS = Object.freeze({
  PAGE: "page",
  LINK: "link",
  IMAGE: "image",
  SELECTION: "selection",
});

export const KIND_LABELS = Object.freeze({
  page: "Page URL",
  link: "Link",
  image: "Image",
  selection: "Selection",
});

function isTracking(name) {
  const key = name.toLowerCase();
  return TRACKING_EXACT.has(key) || TRACKING_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Removes tracking parameters from a URL string. Non-URL input (a text
 * selection) and unparseable input pass through untouched.
 */
export function stripTracking(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return text;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return text;

  const params = url.searchParams;
  const doomed = [...params.keys()].filter(isTracking);
  if (!doomed.length) return text;
  for (const key of doomed) params.delete(key);

  // Drop the '?' entirely rather than leaving a trailing one behind.
  if (![...params.keys()].length) url.search = "";
  return url.toString();
}

export function isUrl(text) {
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function prepare(text, { stripTracking: strip = true } = {}) {
  const trimmed = (text ?? "").trim();
  return strip ? stripTracking(trimmed) : trimmed;
}

/** Middle-truncates so both the origin and the path tail stay readable. */
export function truncate(text, max = 68) {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function filenameFor(text, ext) {
  let base = "qr-code";
  try {
    const url = new URL(text);
    base = `qr-${url.hostname.replace(/^www\./, "")}`;
  } catch {
    // Selection text — keep the generic name.
  }
  return `${base.replace(/[^a-z0-9.-]+/gi, "-").slice(0, 60)}.${ext}`;
}
