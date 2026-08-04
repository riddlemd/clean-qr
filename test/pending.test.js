import { test } from "node:test";
import assert from "node:assert/strict";

import { installBrowserStub } from "./stub-browser.js";

const { session } = installBrowserStub();
const { setPending, takePending } = await import("../src/lib/pending.js");

const KEY = "pendingTarget";

test("set then take round-trips the hand-off", async () => {
  await setPending("https://example.com", "link");
  const record = await takePending();
  assert.equal(record.text, "https://example.com");
  assert.equal(record.kind, "link");
});

test("take consumes the record — a second take returns null", async () => {
  await setPending("https://example.com", "page");
  await takePending();
  assert.equal(await takePending(), null);
});

test("an empty store returns null", async () => {
  session.clear();
  assert.equal(await takePending(), null);
});

test("a stale record is dropped, not delivered", async () => {
  session.set(KEY, { text: "old", kind: "selection", ts: Date.now() - 61_000 });
  assert.equal(await takePending(), null);
  // And it was still removed, so it can't resurface.
  assert.equal(session.has(KEY), false);
});

test("a record just under the age limit is delivered", async () => {
  session.set(KEY, { text: "fresh", kind: "selection", ts: Date.now() - 59_000 });
  const record = await takePending();
  assert.equal(record.text, "fresh");
});
