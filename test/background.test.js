import { test } from "node:test";
import assert from "node:assert/strict";

import { installBrowserStub } from "./stub-browser.js";

const { local, calls } = installBrowserStub();
// Importing runs the module's top-level syncMenus(); settle it before asserting.
const { targetFor, syncMenus } = await import("../src/background.js");
await syncMenus();

test("targetFor reads the field that matches the menu item", () => {
  const info = {
    linkUrl: "https://link.example",
    srcUrl: "https://img.example/i.png",
    selectionText: "picked text",
    pageUrl: "https://page.example",
  };
  const page = "https://page.example";
  // pageUrl rides along on every kind so a selection can be turned into a link to itself.
  assert.deepEqual(targetFor({ ...info, menuItemId: "qr-link" }), { text: "https://link.example", kind: "link", pageUrl: page });
  assert.deepEqual(targetFor({ ...info, menuItemId: "qr-image" }), { text: "https://img.example/i.png", kind: "image", pageUrl: page });
  assert.deepEqual(targetFor({ ...info, menuItemId: "qr-selection" }), { text: "picked text", kind: "selection", pageUrl: page });
  assert.deepEqual(targetFor({ ...info, menuItemId: "qr-page" }), { text: page, kind: "page", pageUrl: page });
  assert.equal(targetFor({ ...info, menuItemId: "someone-elses-item" }), null);
});

test("syncMenus registers all four items when enabled", async () => {
  local.clear(); // contextMenus defaults to true
  calls.menus.length = 0;
  await syncMenus();
  assert.deepEqual(calls.menus, [
    "removeAll",
    "create:qr-link",
    "create:qr-image",
    "create:qr-selection",
    "create:qr-page",
  ]);
});

test("the frame item stays out until asked for", async () => {
  local.clear();
  calls.menus.length = 0;
  await syncMenus();
  assert.ok(!calls.menus.includes("create:qr-frame"), "frame item should be off by default");

  local.set("menuFrame", true);
  calls.menus.length = 0;
  await syncMenus();
  assert.ok(calls.menus.includes("create:qr-frame"));
  local.delete("menuFrame");
});

test("individual menu items can be switched off", async () => {
  local.clear();
  local.set("menuImage", false);
  local.set("menuSelection", false);
  calls.menus.length = 0;
  await syncMenus();
  assert.deepEqual(calls.menus, ["removeAll", "create:qr-link", "create:qr-page"]);
  local.clear();
});

test("syncMenus removes without recreating when disabled", async () => {
  local.set("contextMenus", false);
  calls.menus.length = 0;
  await syncMenus();
  assert.deepEqual(calls.menus, ["removeAll"]);
  local.delete("contextMenus");
});

test("overlapping syncMenus calls never interleave", async () => {
  local.clear();
  calls.menus.length = 0;
  // Unawaited first call: without serialization the second removeAll lands
  // between the first run's removeAll and its creates.
  syncMenus();
  await syncMenus();
  assert.deepEqual(calls.menus, [
    "removeAll",
    "create:qr-link",
    "create:qr-image",
    "create:qr-selection",
    "create:qr-page",
    "removeAll",
    "create:qr-link",
    "create:qr-image",
    "create:qr-selection",
    "create:qr-page",
  ]);
});
