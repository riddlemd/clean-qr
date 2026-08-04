import qrcode from "../vendor/qrcode.mjs";

// Denser to sparser. Downgrading walks toward L, buying back capacity.
const EC_ORDER = ["H", "Q", "M", "L"];

// Past this, module density makes phone-camera scanning off a screen unreliable.
// Screen-displayed codes don't face the physical wear that justifies high EC on
// print, so trading EC for a lower version is the right call here.
export const SOFT_MAX_VERSION = 12;

const QUIET_ZONE = 4; // modules, per ISO/IEC 18004 — never crop this

function attempt(text, ecLevel) {
  const qr = qrcode(0, ecLevel); // typeNumber 0 selects the smallest fitting version
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const matrix = [];
  for (let r = 0; r < count; r++) {
    const row = new Uint8Array(count);
    for (let c = 0; c < count; c++) row[c] = qr.isDark(r, c) ? 1 : 0;
    matrix.push(row);
  }
  return { matrix, count, version: (count - 17) / 4, ecLevel };
}

/**
 * Encodes text, automatically relaxing error correction if the requested level
 * pushes the code past SOFT_MAX_VERSION. Returns `downgraded` so the UI can
 * show the change rather than silently altering what the user picked.
 */
export function encode(text, requestedEc = "M") {
  if (!text) throw new Error("Nothing to encode");

  const start = EC_ORDER.indexOf(requestedEc);
  if (start === -1) throw new Error(`Unknown error correction level: ${requestedEc}`);

  const candidates = EC_ORDER.slice(start);
  let fallback = null;

  for (const ec of candidates) {
    let result;
    try {
      result = attempt(text, ec);
    } catch {
      continue; // capacity exceeded at this level — try a sparser one
    }
    if (result.version <= SOFT_MAX_VERSION) {
      return { ...result, quietZone: QUIET_ZONE, requestedEc, downgraded: ec !== requestedEc, dense: false };
    }
    // Keep the sparsest success in case nothing lands under the ceiling.
    fallback = result;
  }

  if (!fallback) {
    throw new Error("Too long to encode as a QR code");
  }
  return {
    ...fallback,
    quietZone: QUIET_ZONE,
    requestedEc,
    downgraded: fallback.ecLevel !== requestedEc,
    dense: true,
  };
}
