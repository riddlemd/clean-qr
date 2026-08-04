import { caps } from "./lib/caps.js";
import { getSettings, onSettingsChanged } from "./lib/settings.js";
import { setPending } from "./lib/pending.js";
import { TARGET_KINDS } from "./lib/target.js";

const MENU_ITEMS = [
  { id: "qr-link", title: "Generate QR Code for Link", contexts: ["link"], kind: TARGET_KINDS.LINK, field: "linkUrl" },
  { id: "qr-image", title: "Generate QR Code for Image", contexts: ["image"], kind: TARGET_KINDS.IMAGE, field: "srcUrl" },
  { id: "qr-selection", title: "Generate QR Code for Selection", contexts: ["selection"], kind: TARGET_KINDS.SELECTION, field: "selectionText" },
  { id: "qr-page", title: "Generate QR Code for Page", contexts: ["page"], kind: TARGET_KINDS.PAGE, field: "pageUrl" },
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

      const { contextMenus } = await getSettings();
      if (!contextMenus) return;

      for (const { id, title, contexts } of MENU_ITEMS) {
        browser.menus.create({ id, title, contexts });
      }
    })
    .catch(() => {});
  return syncing;
}

function targetFor(info) {
  const item = ITEM_BY_ID.get(info.menuItemId);
  return item ? { text: info[item.field], kind: item.kind } : null;
}

// openPopup() is gesture-gated and has been unreliable across versions, so the
// tab fallback is load-bearing rather than defensive.
async function showQr(target) {
  await setPending(target.text, target.kind);
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

onSettingsChanged((_changes, keys) => {
  if (keys.includes("contextMenus")) syncMenus();
});
