import { initTheme } from "../lib/theme.js";
import { getSettings } from "../lib/settings.js";
import { takePending } from "../lib/pending.js";
import { caps } from "../lib/caps.js";
import { encode, CEILINGS } from "../lib/qr.js";
import {
  toSvgElement,
  toPngBlob,
  toSvgBlob,
  toSvgDataUri,
  asMarkdown,
} from "../lib/render.js";
import { remember } from "../lib/history.js";
import {
  classify,
  parseExtraTracking,
  prepare,
  truncate,
  filenameFor,
  textFragmentUrl,
  KIND_LABELS,
  TARGET_KINDS,
} from "../lib/target.js";

const el = {
  plate: document.getElementById("plate"),
  target: document.getElementById("target"),
  sources: document.getElementById("sources"),
  actions: document.getElementById("actions"),
  notice: document.getElementById("notice"),
  meta: document.getElementById("meta"),
  toast: document.getElementById("toast"),
  settings: document.getElementById("settings"),
};

let settings;
let sources = [];
let selected = 0;
let current = null;
let pageTitle = null;
let extraTracking = null;
let incognito = false;

function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.toast.hidden = true; }, 1600);
}

function showNotice(message, kind = "warn") {
  el.notice.textContent = message;
  el.notice.className = `notice ${kind}`;
  el.notice.hidden = false;
}

function clearNotice() {
  el.notice.className = "notice";
  el.notice.hidden = true;
}

async function activeTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  } catch {
    return null; // No activeTab grant, e.g. a privileged page
  }
}

async function collectSources() {
  const found = [];
  const [pending, tab] = await Promise.all([takePending(), activeTab()]);
  const url = tab?.url ?? null;
  pageTitle = tab?.title ?? null;
  incognito = Boolean(tab?.incognito);

  if (pending?.text) {
    // A selection offers up to three readings: where it is, what it means, and the
    // words themselves. Order puts the most-wanted first; nothing is ever replaced.
    const fragment =
      settings.textFragments && pending.kind === TARGET_KINDS.SELECTION
        ? textFragmentUrl(pending.pageUrl, pending.text, settings.fragmentPrecision)
        : null;
    const typed = pending.kind === TARGET_KINDS.SELECTION ? classify(pending.text) : null;

    const linkFirst = settings.selectionDefault === "link";
    const raw = { kind: pending.kind, text: pending.text };

    // A typed selection is unambiguous, so it outranks a link into the page.
    if (typed) found.push(typed);
    if (fragment && linkFirst) found.push({ kind: TARGET_KINDS.SELECTION_LINK, text: fragment });
    found.push(raw);
    if (fragment && !linkFirst) found.push({ kind: TARGET_KINDS.SELECTION_LINK, text: fragment });
  }

  // In the tab fallback the active tab is this popup itself — offering its
  // moz-extension:// URL as a "Page URL" source would encode nonsense.
  if (url && !url.startsWith("moz-extension:") && !found.some((s) => s.kind === TARGET_KINDS.PAGE)) {
    found.push({ kind: TARGET_KINDS.PAGE, text: url });
  }
  return found;
}

// Built once; selection changes repaint in place so the clicked button keeps focus.
function renderSources() {
  el.sources.replaceChildren();
  if (sources.length < 2) {
    el.sources.hidden = true;
    return;
  }
  el.sources.hidden = false;
  sources.forEach((source, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = KIND_LABELS[source.kind] ?? source.kind;
    button.addEventListener("click", () => {
      if (index === selected) return;
      selected = index;
      paintSources();
      renderCode();
    });
    el.sources.appendChild(button);
  });
  paintSources();
}

function paintSources() {
  [...el.sources.children].forEach((button, index) => {
    const on = index === selected;
    button.className = on ? "selected" : "";
    button.setAttribute("aria-pressed", String(on));
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Stroked outlines on a 16-unit grid, matching the header's settings gear. Paths
// only — no circles or rects — so one builder covers every glyph.
const GLYPHS = {
  share: ["M8 10.5V2.5", "M5 5.5 8 2.5l3 3", "M3.5 8.5v4a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-4"],
  copy: ["M6 6h7.5v7.5H6z", "M10.5 6V3.5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1h2.5"],
  download: ["M8 2.5v8", "M4.5 7 8 10.5 11.5 7", "M2.5 13.5h11"],
  link: [
    "M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 1 0-4.24-4.24l-.7.7",
    "M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 1 0 4.24 4.24l.7-.7",
  ],
  code: ["M5.5 5 2.5 8l3 3", "M10.5 5 13.5 8l-3 3"],
  expand: ["M6 2.5H2.5V6", "M10 2.5h3.5V6", "M6 13.5H2.5V10", "M10 13.5h3.5V10"],
};

function glyph(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of GLYPHS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function renderMeta(code) {
  const ec = code.downgraded
    ? `${code.ecLevel} (lowered from ${code.requestedEc})`
    : code.ecLevel;
  el.meta.textContent = `Error correction: ${ec} · Version ${code.version}`;
}

async function renderCode() {
  clearNotice();
  const source = sources[selected];
  const text = prepare(source.text, { stripTracking: settings.stripTracking, extra: extraTracking });

  let code;
  try {
    code = encode(text, settings.ecLevel, CEILINGS[settings.density]);
  } catch (error) {
    current = null;
    el.plate.replaceChildren();
    el.target.textContent = "";
    el.target.title = "";
    el.meta.textContent = "";
    showNotice(error.message, "error");
    renderActions();
    return;
  }

  el.plate.replaceChildren(toSvgElement(code, { size: settings.size, label: `QR code for ${truncate(text)}` }));
  el.target.textContent = truncate(text);
  el.target.title = text;
  renderMeta(code);

  if (code.dense) {
    showNotice("This is a long URL, so the code is dense and may be harder to scan. Shortening the URL will help.");
  }

  current = { code, text, pngBlob: null };
  renderActions();
  if (settings.recentCodes) remember(text, source.kind, { incognito, limit: settings.recentLimit });

  // Rasterize up front: navigator.share() and clipboard.write() both need to
  // fire inside the click's transient activation, which an await would consume.
  try {
    const blob = await toPngBlob(code, { size: settings.size, scale: settings.pngScale });
    if (current?.code === code) {
      current.pngBlob = blob;
      enableBlobActions();
      if (settings.autoCopy) {
        if (settings.autoCopyFormat === "url" && caps.clipboardText) copyUrl({ silent: true });
        else if (caps.clipboardImage) copyImage({ silent: true });
      }
    }
  } catch {
    // Export stays unavailable; the code itself is still on screen and scannable.
  }
}

function download(blob, filename) {
  // Anchor download avoids the `downloads` permission warning, and is the only
  // path that can work on Android at all — the API was removed in Fenix 79.
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function copyImage({ silent = false } = {}) {
  if (!current?.pngBlob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": current.pngBlob })]);
    if (!silent) toast("Image copied");
  } catch {
    if (!silent) toast("Could not copy image");
  }
}

async function copyUrl({ silent = false } = {}) {
  try {
    await navigator.clipboard.writeText(current.text);
    if (!silent) toast("Copied");
  } catch {
    if (!silent) toast("Could not copy");
  }
}

// SVG rather than PNG: for a QR code it is both smaller and resolution-independent,
// and a PNG data URI at scale 4 runs past what some editors accept on paste.
async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(asMarkdown(toSvgDataUri(current.code), current.text));
    toast("Markdown copied");
  } catch {
    toast("Could not copy");
  }
}

function saveFile() {
  const svg = settings.exportFormat === "svg";
  const blob = svg ? toSvgBlob(current.code) : current.pngBlob;
  if (!blob) return;
  download(
    blob,
    filenameFor(current.text, svg ? "svg" : "png", { style: settings.filename, title: pageTitle })
  );
}

// The popup caps at 300px; a screen does not. Opens the same page in a tab, which
// reads the flag and lays the code out to fill the viewport.
function openLarge() {
  browser.tabs.create({
    url: `${browser.runtime.getURL("src/popup/popup.html")}?view=large&t=${encodeURIComponent(current.text)}`,
  });
  window.close();
}

function share() {
  const file = new File([current.pngBlob], filenameFor(current.text, "png"), { type: "image/png" });
  const data = { files: [file], title: "QR Code" };
  if (caps.shareFiles && !navigator.canShare(data)) {
    navigator.share({ text: current.text }).catch(() => {});
    return;
  }
  navigator.share(data).catch(() => {});
}

// Rebuilt only when the current code changes; the PNG-ready transition just
// flips `disabled` so a button the user already focused isn't destroyed.
function renderActions() {
  el.actions.replaceChildren();
  if (!current) return;

  const ready = Boolean(current.pngBlob);
  const buttons = [];

  // No action is emphasised over the others. The code on screen is the point;
  // these are all just ways of moving it somewhere else.
  if (caps.webShare) {
    buttons.push({ icon: "share", label: "Share", onClick: share, needsBlob: true });
  }
  if (caps.clipboardImage) {
    buttons.push({ icon: "copy", label: "Copy image", onClick: copyImage, needsBlob: true });
  }
  buttons.push({
    icon: "download",
    label: settings.exportFormat === "svg" ? "Save SVG" : "Save PNG",
    onClick: saveFile,
    needsBlob: settings.exportFormat !== "svg",
  });
  if (caps.clipboardText) {
    if (settings.actionCopyUrl) buttons.push({ icon: "link", label: "Copy URL", onClick: copyUrl });
    buttons.push({ icon: "code", label: "Copy Markdown", onClick: copyMarkdown });
  }
  if (settings.actionFullScreen) {
    buttons.push({ icon: "expand", label: "Full screen", onClick: openLarge });
  }

  for (const { icon, label, onClick, needsBlob } of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    // Icon-only, so the label has to reach the accessibility tree some other way:
    // title for a pointer, aria-label for a screen reader.
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(glyph(icon));
    if (needsBlob) {
      button.dataset.needsBlob = "";
      button.disabled = !ready;
    }
    button.addEventListener("click", onClick);
    el.actions.appendChild(button);
  }
}

function enableBlobActions() {
  for (const button of el.actions.querySelectorAll("button[data-needs-blob]")) {
    button.disabled = false;
  }
}

el.settings.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

// Display-only mode: one code, sized to the viewport, no controls. The target comes
// in on the URL because this tab has no hand-off record of its own.
async function renderLarge(text) {
  document.documentElement.classList.add("large");
  const code = encode(prepare(text, { stripTracking: settings.stripTracking, extra: extraTracking }), settings.ecLevel, CEILINGS[settings.density]);
  el.plate.replaceChildren(toSvgElement(code, { label: `QR code for ${truncate(text)}` }));
  el.target.textContent = truncate(text, 120);
  el.sources.hidden = true;
  el.actions.replaceChildren();
  el.meta.textContent = "";
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.close();
  });
}

async function main() {
  const settingsPromise = getSettings();
  const [, loaded] = await Promise.all([initTheme(settingsPromise), settingsPromise]);
  settings = loaded;
  extraTracking = parseExtraTracking(settings.trackingExtra);

  const params = new URLSearchParams(location.search);
  if (params.get("view") === "large" && params.get("t")) {
    await renderLarge(params.get("t"));
    return;
  }

  // Sizes the plate before the QR lands so the spinner→code swap doesn't reflow.
  document.documentElement.style.setProperty("--qr-size", `${settings.size}px`);

  sources = await collectSources();
  if (!sources.length) {
    el.plate.replaceChildren();
    showNotice("Nothing to encode — this page's address isn't available to extensions.", "error");
    return;
  }

  renderSources();
  await renderCode();
}

main().catch(() => {
  // A storage failure here would otherwise leave the spinner running forever.
  el.plate.replaceChildren();
  showNotice("Something went wrong while loading. Try reopening the popup.", "error");
});
