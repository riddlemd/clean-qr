import qrcode from "../vendor/qrcode.mjs";

// The vendor default truncates each UTF-16 code unit to one byte, turning
// anything past U+00FF into mojibake. Scanners expect UTF-8 in byte mode.
qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));

// Ordered denser to sparser: downgrading slices toward L to buy back capacity.
const EC_ORDER = ["H", "Q", "M", "L"];

// Past this, density makes phone-camera scanning off a screen unreliable. Screen
// codes face none of the wear that justifies high EC on print, so EC gives first.
export const SOFT_MAX_VERSION = 12;

// Which way to lean when the two goals conflict: a lower ceiling sheds error
// correction sooner to keep the code sparse, a higher one holds the chosen level
// and accepts a denser code.
export const CEILINGS = Object.freeze({
  scannable: 8,
  balanced: SOFT_MAX_VERSION,
  correction: 20,
});

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

// `downgraded` is reported back so the UI can surface the change rather than
// silently overriding the level the user chose.
export function encode(text, requestedEc = "M", ceiling = SOFT_MAX_VERSION) {
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
    if (result.version <= ceiling) {
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
