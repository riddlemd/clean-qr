// Feature-detected, not platform-sniffed, so this fails safe as Firefox for
// Android gains APIs. `menus` is absent there entirely; `downloads` was removed
// in Fenix 79.
export const caps = {
  menus: typeof browser !== "undefined" && typeof browser.menus !== "undefined",
  downloads: typeof browser !== "undefined" && typeof browser.downloads !== "undefined",
  webShare: typeof navigator.share === "function",
  shareFiles: typeof navigator.canShare === "function",
  clipboardImage: typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function",
  clipboardText: typeof navigator.clipboard?.writeText === "function",
};

// `downloads` splits desktop from Android more reliably than a user-agent string.
export const isAndroid = !caps.downloads && caps.webShare;
