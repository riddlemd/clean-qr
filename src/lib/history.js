// Recent targets, so a code can be regenerated without revisiting the page.
// Records what was encoded — browsing history by another name — so it must
// never write from a private window.

const KEY = "recent";
const DEFAULT_LIMIT = 10;

// The per-code toggles that produced the entry. Only recorded where the toggle
// was actually offered, so a plain page URL carries no meaningless `typed: false`.
const FLAGS = ["stripTracking", "typed"];

export async function recent() {
  const { [KEY]: list } = await browser.storage.local.get(KEY);
  return Array.isArray(list) ? list : [];
}

export async function remember(text, kind, { incognito = false, limit = DEFAULT_LIMIT, flags = {} } = {}) {
  if (!text || incognito || limit < 1) return;

  const entry = { text, kind, ts: Date.now() };
  for (const flag of FLAGS) {
    if (flag in flags) entry[flag] = Boolean(flags[flag]);
  }

  const list = await recent();
  const without = list.filter((existing) => existing.text !== text);
  without.unshift(entry);
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
