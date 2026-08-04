// Recent targets, so a code can be regenerated without revisiting the page.
//
// This records what was encoded, which is browsing history by another name. It is
// off by default, capped, cleared when switched off, and never written from a
// private window.

const KEY = "recent";
const DEFAULT_LIMIT = 10;

export async function recent() {
  const { [KEY]: list } = await browser.storage.local.get(KEY);
  return Array.isArray(list) ? list : [];
}

export async function remember(text, kind, { incognito = false, limit = DEFAULT_LIMIT } = {}) {
  if (!text || incognito || limit < 1) return;

  const list = await recent();
  // Re-encoding the same thing moves it to the top rather than adding a duplicate.
  const without = list.filter((entry) => entry.text !== text);
  without.unshift({ text, kind, ts: Date.now() });
  await browser.storage.local.set({ [KEY]: without.slice(0, limit) });
}

// Lowering the limit has to drop what no longer fits — otherwise the extra
// entries sit in storage invisibly, past the number the user asked to keep.
export async function trim(limit) {
  const list = await recent();
  if (list.length <= limit) return;
  await browser.storage.local.set({ [KEY]: list.slice(0, limit) });
}

export async function forget() {
  await browser.storage.local.remove(KEY);
}
