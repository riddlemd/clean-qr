import { caps } from "./lib/caps.js";
import { getSettings, onSettingsChanged } from "./lib/settings.js";
import { setPending } from "./lib/pending.js";
import { TARGET_KINDS } from "./lib/target.js";

const MENU_ITEMS = [
  { id: "qr-link", title: "Generate QR Code for Link", contexts: ["link"], kind: TARGET_KINDS.LINK, field: "linkUrl", setting: "menuLink" },
  { id: "qr-image", title: "Generate QR Code for Image", contexts: ["image"], kind: TARGET_KINDS.IMAGE, field: "srcUrl", setting: "menuImage" },
  { id: "qr-selection", title: "Generate QR Code for Selection", contexts: ["selection"], kind: TARGET_KINDS.SELECTION, field: "selectionText", setting: "menuSelection" },
  { id: "qr-page", title: "Generate QR Code for Page", contexts: ["page"], kind: TARGET_KINDS.PAGE, field: "pageUrl", setting: "menuPage" },
  { id: "qr-frame", title: "Generate QR Code for Frame", contexts: ["frame"], kind: TARGET_KINDS.FRAME, field: "frameUrl", setting: "menuFrame" },
];

const ITEM_BY_ID = new Map(MENU_ITEMS.map((item) => [item.id, item]));

// Serialized: two overlapping runs can interleave removeAll with create,
// duplicating or silently dropping menu items.
let syncing = Promise.resolve();
function syncMenus() {
  syncing = syncing
    .then(async () => {
      if (!caps.menus) return; // Android has no menus API at all
      await browser.menus.removeAll();

      const settings = await getSettings();
      if (!settings.contextMenus) return;

      for (const { id, title, contexts, setting } of MENU_ITEMS) {
        if (settings[setting]) browser.menus.create({ id, title, contexts });
      }
    })
    .catch(() => {});
  return syncing;
}

function targetFor(info) {
  const item = ITEM_BY_ID.get(info.menuItemId);
  return item ? { text: info[item.field], kind: item.kind, pageUrl: info.pageUrl } : null;
}

// openPopup() is gesture-gated and has been unreliable across versions, so the
// tab fallback is load-bearing rather than defensive.
async function showQr(target) {
  await setPending(target.text, target.kind, target.pageUrl);
  try {
    if (typeof browser.action?.openPopup !== "function") throw new Error("openPopup unavailable");
    await browser.action.openPopup();
  } catch {
    await browser.tabs.create({
      url: browser.runtime.getURL("src/popup/popup.html"),
    });
  }
}

if (caps.menus) {
  browser.menus.onClicked.addListener(async (info) => {
    const target = targetFor(info);
    if (target?.text) await showQr(target);
  });
}

// Runs on every event-page wake, not just install/startup — menu persistence
// across suspends isn't guaranteed on the oldest supported Firefox, and
// removeAll makes the rebuild idempotent.
syncMenus();

const MENU_SETTINGS = new Set(["contextMenus", ...MENU_ITEMS.map((i) => i.setting)]);

onSettingsChanged((_changes, keys) => {
  if (keys.some((k) => MENU_SETTINGS.has(k))) syncMenus();
});

// Exported for the test suite; nothing imports this module at runtime.
export { targetFor, syncMenus };
