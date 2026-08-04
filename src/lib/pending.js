const KEY = "pendingTarget";

// The event page can suspend between the menu click and the popup opening, so
// the hand-off cannot live in a module-level variable.
const area = () => browser.storage.session;

// Stops an abandoned hand-off from resurfacing later and encoding something the
// user right-clicked long ago.
const MAX_AGE_MS = 60_000;

export async function setPending(text, kind) {
  await area().set({ [KEY]: { text, kind, ts: Date.now() } });
}

export async function takePending() {
  const store = area();
  const { [KEY]: record } = await store.get(KEY);
  if (!record) return null;
  await store.remove(KEY);
  return Date.now() - record.ts > MAX_AGE_MS ? null : record;
}
