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
  SELECTION_LINK: "selectionLink",
  FRAME: "frame",
  PHONE: "phone",
  EMAIL: "email",
  GEO: "geo",
});

export const KIND_LABELS = Object.freeze({
  page: "Page URL",
  link: "Link",
  image: "Image",
  selection: "Selection",
  selectionLink: "Link to selection",
  frame: "Frame",
  phone: "Phone",
  email: "Email",
  geo: "Location",
});

// Selection often arrives with the sentence punctuation around it.
const EDGE_PUNCTUATION = /^[\s"'“”‘’(<[{]+|[\s"'“”‘’)>\]}.,;:!?]+$/g;

// Deliberately strict. A wrong guess is worse than plain text — it sends the
// scanner into a dialer or a map for something that was neither. Anything that
// could plausibly be a price, date, version, ISBN or part number must fall through.
const PHONE = /^\+\d[\d\s().-]{6,20}$/;
const EMAIL = /^[^\s@,;:<>()[\]"]+@[^\s@.,;:<>()[\]"]+\.[a-z]{2,}$/i;
const GEO = /^(-?\d{1,3}\.\d{1,10})\s*,\s*(-?\d{1,3}\.\d{1,10})$/;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
// A bare domain is only a URL if it ends in something that looks like a real TLD,
// which keeps "v1.2.3" out.
const PLAUSIBLE_TLD = /\.[a-z]{2,24}(\/|$)/i;
// ...but a TLD-shaped ending is also what a file extension looks like, so a
// path-less string ending in a familiar extension is a filename, not a host.
const FILE_EXTENSION =
  /\.(txt|md|rtf|json|ya?ml|toml|ini|cfg|log|bak|csv|tsv|pdf|zip|g?tar|gz|7z|rar|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|webp|avif|ico|mp[34]|m4a|mov|avi|mkv|wav|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|xml|sh|bat|ps1|py|rb|rs|go|java|c|cc|cpp|h|hpp|swift|kt|php|sql|exe|dmg|pkg|deb|rpm)$/i;

// "(0)" is the national trunk prefix — written for local dialling, dropped when
// calling internationally. Other bracketed digits are area codes and must stay.
const TRUNK_PREFIX = /\(0\)/g;

// Returns { kind, text } for a selection that is unambiguously actionable when
// scanned, or null. Always offered alongside the raw text, never instead of it.
export function classify(selection) {
  const text = (selection ?? "").replace(/\s+/g, " ").replace(EDGE_PUNCTUATION, "").trim();
  if (!text) return null;

  if (EMAIL.test(text)) return { kind: TARGET_KINDS.EMAIL, text: `mailto:${text}` };

  const geo = text.match(GEO);
  if (geo) {
    const [lat, lon] = [Number(geo[1]), Number(geo[2])];
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { kind: TARGET_KINDS.GEO, text: `geo:${lat},${lon}` };
    }
  }

  if (PHONE.test(text)) {
    const digits = text.replace(TRUNK_PREFIX, "").replace(/[^\d]/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return { kind: TARGET_KINDS.PHONE, text: `tel:+${digits}` };
    }
  }

  const looksLikeFile = !text.includes("/") && FILE_EXTENSION.test(text);
  if (!text.includes(" ") && !looksLikeFile && BARE_DOMAIN.test(text) && PLAUSIBLE_TLD.test(text)) {
    return { kind: TARGET_KINDS.LINK, text: `https://${text}` };
  }

  return null;
}

// Words taken from each end when a selection is too long to encode whole.
const FRAGMENT_EDGE_WORDS = 5;

// A text fragment (#:~:text=) scrolls the reader to the selected passage without
// the page needing an id to anchor to. The receiving browser resolves it, so the
// version generating the code is irrelevant — Firefox reads them from 131,
// Chrome and Safari long before that, and anything older just ignores the
// directive and loads the page normally.
//
// Long selections use the start,end form: it matches the same passage while
// encoding only the two ends, which keeps the QR far sparser.
export function textFragmentUrl(pageUrl, selection, precision = "auto") {
  const text = (selection ?? "").replace(/\s+/g, " ").trim();
  if (!text || !pageUrl) return null;

  let url;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const words = text.split(" ");
  // Too few words to have a middle worth dropping, so "ends" would be the whole
  // thing anyway — the compact form only pays off on longer passages.
  const compact =
    words.length > FRAGMENT_EDGE_WORDS * 2 && (precision === "ends" || precision === "auto");
  const directive = compact
    ? `${encodeURIComponent(words.slice(0, FRAGMENT_EDGE_WORDS).join(" "))},` +
      `${encodeURIComponent(words.slice(-FRAGMENT_EDGE_WORDS).join(" "))}`
    : encodeURIComponent(text);

  // Any existing fragment is replaced — two directives on one URL don't combine.
  return `${url.href.split("#")[0]}#:~:text=${directive}`;
}

function isTracking(name, extra) {
  const key = name.toLowerCase();
  if (extra?.has(key)) return true;
  return TRACKING_EXACT.has(key) || TRACKING_PREFIXES.some((p) => key.startsWith(p));
}

// User-supplied names, comma or space separated.
export function parseExtraTracking(input) {
  return new Set(
    (input ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Non-URL input (a text selection) passes through untouched rather than throwing.
export function stripTracking(text, extra) {
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
      return !isTracking(decodeURIComponent(name), extra);
    } catch {
      return true;
    }
  });
  if (kept.length === pairs.length) return text;

  // Drop the '?' entirely rather than leaving a trailing one behind.
  url.search = kept.length ? `?${kept.join("&")}` : "";
  return url.toString();
}

export function prepare(text, { stripTracking: strip = true, extra } = {}) {
  const trimmed = (text ?? "").trim();
  return strip ? stripTracking(trimmed, extra) : trimmed;
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

export function filenameFor(text, ext, { style = "host", title = null, now = new Date() } = {}) {
  let base = "qr-code";

  if (style === "title" && title) {
    base = `qr-${title}`;
  } else {
    try {
      // Hostname-less URLs (mailto:, data:, about:) keep the generic name too.
      const { hostname } = new URL(text);
      if (hostname) base = `qr-${hostname.replace(/^www\./, "")}`;
    } catch {
      // Selection text — keep the generic name.
    }
    if (style === "hostDate") base += `-${now.toISOString().slice(0, 10)}`;
  }

  return `${base.replace(/[^a-z0-9.-]+/gi, "-").replace(/-+/g, "-").slice(0, 60)}.${ext}`;
}
