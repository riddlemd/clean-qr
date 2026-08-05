import { test } from "node:test";
import assert from "node:assert/strict";

import { installBrowserStub } from "./stub-browser.js";

const { local } = installBrowserStub();
const { recent, remember, forget, trim } = await import("../src/lib/history.js");

test("an empty store has no history", async () => {
  local.clear();
  assert.deepEqual(await recent(), []);
});

test("newest first", async () => {
  local.clear();
  await remember("first", "page");
  await remember("second", "page");
  assert.deepEqual((await recent()).map((e) => e.text), ["second", "first"]);
});

test("re-encoding moves an entry up rather than duplicating it", async () => {
  local.clear();
  await remember("a", "page");
  await remember("b", "page");
  await remember("a", "page");
  assert.deepEqual((await recent()).map((e) => e.text), ["a", "b"]);
});

test("the list is capped", async () => {
  local.clear();
  for (let i = 0; i < 15; i++) await remember(`item-${i}`, "page");
  const list = await recent();
  assert.equal(list.length, 10);
  assert.equal(list[0].text, "item-14", "newest kept");
  assert.ok(!list.some((e) => e.text === "item-0"), "oldest dropped");
});

test("the cap follows the chosen limit", async () => {
  local.clear();
  for (let i = 0; i < 8; i++) await remember(`item-${i}`, "page", { limit: 5 });
  assert.equal((await recent()).length, 5);
});

test("lowering the limit discards what no longer fits", async () => {
  local.clear();
  for (let i = 0; i < 10; i++) await remember(`item-${i}`, "page", { limit: 10 });
  await trim(3);
  const list = await recent();
  assert.equal(list.length, 3);
  assert.equal(list[0].text, "item-9", "the newest survive");
});

test("raising the limit leaves the list alone", async () => {
  local.clear();
  for (let i = 0; i < 4; i++) await remember(`item-${i}`, "page", { limit: 10 });
  await trim(25);
  assert.equal((await recent()).length, 4);
});

// The guard that matters: a private window must leave no trace.
test("private windows are never recorded", async () => {
  local.clear();
  await remember("secret", "page", { incognito: true });
  assert.deepEqual(await recent(), []);
});

test("nothing is recorded for empty text", async () => {
  local.clear();
  await remember("", "page");
  assert.deepEqual(await recent(), []);
});

test("the toggles that produced a code are recorded with it", async () => {
  local.clear();
  await remember("https://example.com/", "page", { flags: { stripTracking: false, typed: true } });
  const [entry] = await recent();
  assert.equal(entry.stripTracking, false);
  assert.equal(entry.typed, true);
});

// An entry should not claim a choice the popup never offered — a page URL has no
// typed reading, so recording `typed: false` against it would be an invention.
test("a toggle that was never offered is left off the entry", async () => {
  local.clear();
  await remember("https://example.com/", "page", { flags: { stripTracking: true } });
  const [entry] = await recent();
  assert.equal(entry.stripTracking, true);
  assert.ok(!("typed" in entry), "typed is absent, not false");
});

test("entries carry no flags when none are passed", async () => {
  local.clear();
  await remember("plain", "page");
  assert.deepEqual(Object.keys(await recent().then((l) => l[0])).sort(), ["kind", "text", "ts"]);
});

test("unrecognised flags are not stored", async () => {
  local.clear();
  await remember("a", "page", { flags: { nonsense: true } });
  assert.ok(!("nonsense" in (await recent())[0]));
});

test("forget clears the list", async () => {
  local.clear();
  await remember("a", "page");
  await forget();
  assert.deepEqual(await recent(), []);
});
