import { caps } from "./lib/caps.js";
import { getSettings, onSettingsChanged } from "./lib/settings.js";
import { setPending } from "./lib/pending.js";
import { TARGET_KINDS } from "./lib/target.js";

const MENU_ITEMS = [
  { id: "qr-link", title: "Generate QR Code for Link", contexts: ["link"], kind: TARGET_KINDS.LINK },
  { id: "qr-image", title: "Generate QR Code for Image", contexts: ["image"], kind: TARGET_KINDS.IMAGE },
  { id: "qr-selection", title: "Generate QR Code for Selection", contexts: ["selection"], kind: TARGET_KINDS.SELECTION },
  { id: "qr-page", title: "Generate QR Code for Page", contexts: ["page"], kind: TARGET_KINDS.PAGE },
];

const KIND_BY_ID = new Map(MENU_ITEMS.map((item) => [item.id, item.kind]));

async function syncMenus() {
  if (!caps.menus) return; // Android has no menus API at all
  await browser.menus.removeAll();

  const { contextMenus } = await getSettings();
  if (!contextMenus) return;

  for (const { id, title, contexts } of MENU_ITEMS) {
    browser.menus.create({ id, title, contexts });
  }
}

function targetFor(info) {
  switch (KIND_BY_ID.get(info.menuItemId)) {
    case TARGET_KINDS.LINK:
      return { text: info.linkUrl, kind: TARGET_KINDS.LINK };
    case TARGET_KINDS.IMAGE:
      return { text: info.srcUrl, kind: TARGET_KINDS.IMAGE };
    case TARGET_KINDS.SELECTION:
      return { text: info.selectionText, kind: TARGET_KINDS.SELECTION };
    case TARGET_KINDS.PAGE:
      return { text: info.pageUrl, kind: TARGET_KINDS.PAGE };
    default:
      return null;
  }
}

// action.openPopup() is gated on user-gesture context and has been inconsistent
// across versions. A menu click is a gesture, but when the call is unavailable
// or rejects we open the same document as a tab instead of dropping the action.
async function showQr(target) {
  await setPending(target.text, target.kind);
  try {
    if (typeof browser.action?.openPopup !== "function") throw new Error("openPopup unavailable");
    await browser.action.openPopup();
  } catch {
    await browser.tabs.create({
      url: browser.runtime.getURL("src/popup/popup.html?as=tab"),
    });
  }
}

if (caps.menus) {
  browser.menus.onClicked.addListener(async (info) => {
    const target = targetFor(info);
    if (target?.text) await showQr(target);
  });
}

browser.runtime.onInstalled.addListener(syncMenus);
browser.runtime.onStartup.addListener(syncMenus);

onSettingsChanged((_changes, keys) => {
  if (keys.includes("contextMenus")) syncMenus();
});
