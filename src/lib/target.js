// Dropping these lowers the QR version, which is what makes the code easier to
// scan. Prefixes cover the open-ended utm_*/mc_* families.
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

// Non-URL input (a text selection) passes through untouched rather than throwing.
export function stripTracking(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return text;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return text;
  if (!url.search) return text;

  // Filtered on the raw query string — URLSearchParams would re-serialize the
  // survivors (%20 becomes +, bare flags gain =), changing bytes the user chose.
  const pairs = url.search.slice(1).split("&");
  const kept = pairs.filter((pair) => {
    const name = pair.split("=", 1)[0];
    try {
      return !isTracking(decodeURIComponent(name));
    } catch {
      return true;
    }
  });
  if (kept.length === pairs.length) return text;

  // Drop the '?' entirely rather than leaving a trailing one behind.
  url.search = kept.length ? `?${kept.join("&")}` : "";
  return url.toString();
}

export function prepare(text, { stripTracking: strip = true } = {}) {
  const trimmed = (text ?? "").trim();
  return strip ? stripTracking(trimmed) : trimmed;
}

// Middle-truncated so both the origin and the path tail stay readable.
// Sliced by code point — a code-unit slice can strand half a surrogate pair.
export function truncate(text, max = 68) {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

export function filenameFor(text, ext) {
  let base = "qr-code";
  try {
    // Hostname-less URLs (mailto:, data:, about:) keep the generic name too.
    const { hostname } = new URL(text);
    if (hostname) base = `qr-${hostname.replace(/^www\./, "")}`;
  } catch {
    // Selection text — keep the generic name.
  }
  return `${base.replace(/[^a-z0-9.-]+/gi, "-").slice(0, 60)}.${ext}`;
}
