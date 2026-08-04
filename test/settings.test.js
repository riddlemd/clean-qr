import { test } from "node:test";
import assert from "node:assert/strict";

import { installBrowserStub } from "./stub-browser.js";

const { local, emitStorageChange } = installBrowserStub();
const { DEFAULTS, getSettings, setSetting, onSettingsChanged } = await import("../src/lib/settings.js");

test("defaults come back when nothing is stored", async () => {
  local.clear();
  assert.deepEqual(await getSettings(), DEFAULTS);
});

test("valid stored values survive", async () => {
  local.clear();
  local.set("theme", "dark");
  local.set("size", 300);
  local.set("ecLevel", "H");
  const settings = await getSettings();
  assert.equal(settings.theme, "dark");
  assert.equal(settings.size, 300);
  assert.equal(settings.ecLevel, "H");
});

test("corrupt stored values fall back to defaults", async () => {
  local.clear();
  local.set("ecLevel", "X");
  local.set("size", 999);
  local.set("theme", "purple");
  local.set("pngScale", "2"); // right number, wrong type
  const settings = await getSettings();
  assert.equal(settings.ecLevel, DEFAULTS.ecLevel);
  assert.equal(settings.size, DEFAULTS.size);
  assert.equal(settings.theme, DEFAULTS.theme);
  assert.equal(settings.pngScale, DEFAULTS.pngScale);
});

test("setSetting rejects unknown keys and invalid values", async () => {
  await assert.rejects(() => setSetting("bogus", 1), /Unknown setting/);
  await assert.rejects(() => setSetting("ecLevel", "X"), /Invalid ecLevel/);
  await assert.rejects(() => setSetting("size", 175), /Invalid size/);
});

test("setSetting persists a valid value", async () => {
  local.clear();
  await setSetting("exportFormat", "svg");
  assert.equal(local.get("exportFormat"), "svg");
});

test("onSettingsChanged filters by area and known keys", () => {
  const seen = [];
  onSettingsChanged((_changes, keys) => seen.push(keys));

  emitStorageChange({ theme: { newValue: "dark" } }, "sync");
  assert.equal(seen.length, 0, "non-local area must be ignored");

  emitStorageChange({ unrelated: { newValue: 1 } }, "local");
  assert.equal(seen.length, 0, "unknown keys must be ignored");

  emitStorageChange({ theme: { newValue: "dark" }, unrelated: { newValue: 1 } }, "local");
  assert.deepEqual(seen, [["theme"]], "known keys pass through, unknown are filtered");
});
