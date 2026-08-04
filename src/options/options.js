import { initTheme, applyTheme } from "../lib/theme.js";
import { getSettings, setSetting } from "../lib/settings.js";
import { recent, forget, trim } from "../lib/history.js";
import { caps } from "../lib/caps.js";
import { encode } from "../lib/qr.js";
import { toSvgElement } from "../lib/render.js";

const PREVIEW_URL = "https://example.com/preview";
const PREVIEW_MAX = 132; // keeps Large from overflowing the settings row

let settings;
const previewEl = document.getElementById("preview");

const cast = (element, value) =>
  element.dataset.type === "number" ? Number(value) : value;

function paintSegmented(group) {
  const value = String(settings[group.dataset.setting]);
  for (const button of group.querySelectorAll("button")) {
    const on = button.dataset.value === value;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  }
}

function paintToggle(button) {
  button.setAttribute("aria-checked", String(Boolean(settings[button.dataset.setting])));
}

function renderPreview() {
  try {
    const code = encode(PREVIEW_URL, settings.ecLevel);
    previewEl.replaceChildren(
      toSvgElement(code, { size: Math.min(settings.size, PREVIEW_MAX), label: "Example QR code" })
    );
  } catch {
    previewEl.replaceChildren();
  }
}

async function update(key, value) {
  settings = { ...settings, [key]: value };
  if (key === "theme") applyTheme(value); // repaint before the storage round-trip
  await setSetting(key, value);
  // Switching the setting off must take what was already stored with it —
  // leaving the list behind after opting out would be a surprise.
  if (key === "recentCodes" && !value) {
    await forget();
    await paintRecentCount();
  }
  if (key === "recentLimit") {
    await trim(value);
    await paintRecentCount();
  }
  // Only these two shape the preview; re-encoding for the rest is thrown away.
  if (key === "size" || key === "ecLevel") renderPreview();
}

async function paintRecentCount() {
  const count = (await recent()).length;
  document.getElementById("recent-count").textContent =
    count === 0 ? "Nothing stored." : `${count} code${count === 1 ? "" : "s"} stored on this device.`;
  document.getElementById("clear-recent").disabled = count === 0;
}

function bind() {
  for (const group of document.querySelectorAll(".segmented[data-setting]")) {
    paintSegmented(group);
    group.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button || button.disabled) return;
      await update(group.dataset.setting, cast(group, button.dataset.value));
      paintSegmented(group);
    });
  }

  for (const button of document.querySelectorAll(".toggle[data-setting]")) {
    paintToggle(button);
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      await update(button.dataset.setting, !settings[button.dataset.setting]);
      paintToggle(button);
    });
  }

  for (const select of document.querySelectorAll("select[data-setting]")) {
    select.value = settings[select.dataset.setting];
    select.addEventListener("change", () => update(select.dataset.setting, select.value));
  }

  for (const box of document.querySelectorAll("input[type=checkbox][data-setting]")) {
    box.checked = Boolean(settings[box.dataset.setting]);
    box.addEventListener("change", () => update(box.dataset.setting, box.checked));
  }

  for (const field of document.querySelectorAll("input[type=text][data-setting]")) {
    field.value = settings[field.dataset.setting] ?? "";
    // Committed on blur rather than per keystroke, so storage isn't written to on
    // every letter and the value can't be rejected mid-word.
    field.addEventListener("change", () => update(field.dataset.setting, field.value.trim()));
  }
}

function markUnavailable() {
  if (caps.menus) return;
  // Android has no menus API, so the toggle would be a control over nothing.
  const row = document.getElementById("row-menus");
  row.classList.add("unavailable");
  row.querySelector(".toggle").disabled = true;
  row.querySelector(".row-desc").textContent =
    "Not available on Firefox for Android — the context menu API doesn't exist on this platform.";
}

async function main() {
  const settingsPromise = getSettings();
  const [, loaded] = await Promise.all([initTheme(settingsPromise), settingsPromise]);
  settings = loaded;

  bind();
  markUnavailable();
  renderPreview();

  const clear = document.getElementById("clear-recent");
  clear.addEventListener("click", async () => {
    await forget();
    await paintRecentCount();
    clear.textContent = "Cleared";
    setTimeout(() => { clear.textContent = "Clear now"; }, 1600);
  });
  await paintRecentCount();

  const { version } = browser.runtime.getManifest();
  document.getElementById("version").textContent = `Clean QR for Firefox · v${version}`;
}

main();
