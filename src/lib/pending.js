const KEY = "pendingTarget";

// The background page is non-persistent, so the hand-off cannot live in a
// module-level variable — it has to survive the page being suspended between
// the menu click and the popup opening. storage.session requires Firefox 115,
// which is the manifest's minimum.
const area = () => browser.storage.session;

// Guards against a suspended hand-off resurfacing much later in the same
// session and encoding something the user right-clicked long ago.
const MAX_AGE_MS = 60_000;

export async function setPending(text, kind) {
  await area().set({ [KEY]: { text, kind, ts: Date.now() } });
}

/** Reads and clears in one step — a hand-off is consumed exactly once. */
export async function takePending() {
  const store = area();
  const { [KEY]: record } = await store.get(KEY);
  if (!record) return null;
  await store.remove(KEY);
  return Date.now() - record.ts > MAX_AGE_MS ? null : record;
}
