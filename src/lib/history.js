// Recent targets, so a code can be regenerated without revisiting the page.
// Records what was encoded — browsing history by another name — so it must
// never write from a private window.

const KEY = "recent";
const DEFAULT_LIMIT = 10;

export async function recent() {
  const { [KEY]: list } = await browser.storage.local.get(KEY);
  return Array.isArray(list) ? list : [];
}

export async function remember(text, kind, { incognito = false, limit = DEFAULT_LIMIT } = {}) {
  if (!text || incognito || limit < 1) return;

  const list = await recent();
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
