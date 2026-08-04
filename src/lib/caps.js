// Feature-detected, not platform-sniffed, so this fails safe as Firefox for
// Android gains APIs. `menus` is absent there entirely.
export const caps = {
  menus: typeof browser !== "undefined" && typeof browser.menus !== "undefined",
  webShare: typeof navigator.share === "function",
  shareFiles: typeof navigator.canShare === "function",
  clipboardImage: typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function",
  clipboardText: typeof navigator.clipboard?.writeText === "function",
};
