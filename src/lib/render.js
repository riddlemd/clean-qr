const SVG_NS = "http://www.w3.org/2000/svg";

// The code always renders dark-on-white regardless of UI theme. An inverted or
// low-contrast QR is a well-known scanner-failure mode, so the theme setting is
// deliberately not allowed to reach these two values.
export const DARK = "#0c0c0d";
export const LIGHT = "#ffffff";

function modulePath({ matrix, count }) {
  let d = "";
  for (let r = 0; r < count; r++) {
    const row = matrix[r];
    for (let c = 0; c < count; c++) {
      if (row[c]) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return d;
}

/** Builds an <svg> element sized in module units, so it scales crisply at any DPR. */
export function toSvgElement(code, { size } = {}) {
  const { count, quietZone } = code;
  const edge = count + quietZone * 2;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `0 0 ${edge} ${edge}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  if (size) {
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
  }

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", edge);
  bg.setAttribute("height", edge);
  bg.setAttribute("fill", LIGHT);
  svg.appendChild(bg);

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("transform", `translate(${quietZone} ${quietZone})`);
  path.setAttribute("fill", DARK);
  path.setAttribute("d", modulePath(code));
  svg.appendChild(path);

  return svg;
}

export function toSvgString(code) {
  const svg = toSvgElement(code);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

/**
 * Draws straight from the module matrix rather than rasterizing the SVG — no
 * image decode, no async, and module edges land on exact pixel boundaries.
 */
export function toCanvas(code, { size = 200, scale = 2 } = {}) {
  const { matrix, count, quietZone } = code;
  const edge = count + quietZone * 2;

  // Round the module size up so modules stay integer-sized; the canvas grows to
  // match rather than letting fractional widths blur module edges.
  const modulePx = Math.max(1, Math.ceil((size * scale) / edge));
  const px = modulePx * edge;

  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = LIGHT;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = DARK;
  for (let r = 0; r < count; r++) {
    const row = matrix[r];
    for (let c = 0; c < count; c++) {
      if (row[c]) {
        ctx.fillRect((c + quietZone) * modulePx, (r + quietZone) * modulePx, modulePx, modulePx);
      }
    }
  }
  return canvas;
}

export function toPngBlob(code, opts) {
  return new Promise((resolve, reject) => {
    toCanvas(code, opts).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not rasterize QR code"))),
      "image/png"
    );
  });
}

export function toSvgBlob(code) {
  return new Blob([toSvgString(code)], { type: "image/svg+xml" });
}
