// Feature-detected rather than platform-sniffed so this fails safe as Firefox
// for Android gains APIs. Notable gaps it papers over: `menus` is absent on
// Android entirely, and `downloads` was removed there in Fenix 79.
export const caps = {
  menus: typeof browser !== "undefined" && typeof browser.menus !== "undefined",
  downloads: typeof browser !== "undefined" && typeof browser.downloads !== "undefined",
  webShare: typeof navigator.share === "function",
  shareFiles: typeof navigator.canShare === "function",
  clipboardImage: typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function",
  clipboardText: typeof navigator.clipboard?.writeText === "function",
};

// `downloads` is the clearer signal than a user-agent string: it is present on
// every desktop build and absent on every current Android one.
export const isAndroid = !caps.downloads && caps.webShare;
