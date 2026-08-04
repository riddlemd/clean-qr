import { initTheme } from "../lib/theme.js";
import { getSettings } from "../lib/settings.js";
import { takePending } from "../lib/pending.js";
import { caps } from "../lib/caps.js";
import { encode } from "../lib/qr.js";
import { toSvgElement, toPngBlob, toSvgBlob } from "../lib/render.js";
import { prepare, truncate, filenameFor, KIND_LABELS, TARGET_KINDS } from "../lib/target.js";

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
let current = null; // { code, text, pngBlob }

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
  el.notice.hidden = true;
}

async function activeTabUrl() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? null;
  } catch {
    return null; // No activeTab grant, e.g. a privileged page
  }
}

async function collectSources() {
  const found = [];
  const pending = await takePending();
  if (pending?.text) found.push({ kind: pending.kind, text: pending.text });

  const url = await activeTabUrl();
  if (url && !found.some((s) => s.kind === TARGET_KINDS.PAGE)) {
    found.push({ kind: TARGET_KINDS.PAGE, text: url });
  }
  return found;
}

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
    button.className = index === selected ? "selected" : "";
    button.setAttribute("aria-pressed", String(index === selected));
    button.addEventListener("click", () => {
      if (index === selected) return;
      selected = index;
      renderSources();
      renderCode();
    });
    el.sources.appendChild(button);
  });
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
  const text = prepare(source.text, { stripTracking: settings.stripTracking });

  let code;
  try {
    code = encode(text, settings.ecLevel);
  } catch (error) {
    current = null;
    el.plate.replaceChildren();
    el.meta.textContent = "";
    showNotice(error.message, "error");
    renderActions();
    return;
  }

  el.plate.replaceChildren(toSvgElement(code, { size: settings.size }));
  el.target.textContent = truncate(text);
  el.target.title = text;
  renderMeta(code);

  if (code.dense) {
    showNotice("This is a long URL, so the code is dense and may be harder to scan. Shortening the URL will help.");
  }

  current = { code, text, pngBlob: null };
  renderActions();

  // Rasterize up front: navigator.share() and clipboard.write() both need to
  // fire inside the click's transient activation, which an await would consume.
  try {
    const blob = await toPngBlob(code, { size: settings.size, scale: settings.pngScale });
    if (current?.code === code) {
      current.pngBlob = blob;
      renderActions();
      if (settings.autoCopy && caps.clipboardImage) copyImage({ silent: true });
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

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(current.text);
    toast("Copied");
  } catch {
    toast("Could not copy");
  }
}

function saveFile() {
  const svg = settings.exportFormat === "svg";
  const blob = svg ? toSvgBlob(current.code) : current.pngBlob;
  if (!blob) return;
  download(blob, filenameFor(current.text, svg ? "svg" : "png"));
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

function renderActions() {
  el.actions.replaceChildren();
  if (!current) return;

  const ready = Boolean(current.pngBlob);
  const buttons = [];

  if (caps.webShare) {
    buttons.push({ label: "Share…", onClick: share, primary: true, needsBlob: true });
  }
  if (caps.clipboardImage) {
    buttons.push({ label: "Copy image", onClick: copyImage, primary: !caps.webShare, needsBlob: true });
  }
  buttons.push({
    label: settings.exportFormat === "svg" ? "Save SVG" : "Save PNG",
    onClick: saveFile,
    needsBlob: settings.exportFormat !== "svg",
  });
  if (caps.clipboardText) {
    buttons.push({ label: "Copy URL", onClick: copyUrl });
  }

  for (const { label, onClick, primary, needsBlob } of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (primary) button.className = "primary";
    button.disabled = Boolean(needsBlob) && !ready;
    button.addEventListener("click", onClick);
    el.actions.appendChild(button);
  }
}

el.settings.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

async function main() {
  const [, loaded] = await Promise.all([initTheme(), getSettings()]);
  settings = loaded;

  sources = await collectSources();
  if (!sources.length) {
    el.plate.replaceChildren();
    showNotice("Nothing to encode — this page's address isn't available to extensions.", "error");
    return;
  }

  renderSources();
  await renderCode();
}

main();
