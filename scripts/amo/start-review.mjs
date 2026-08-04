#!/usr/bin/env node
// Submits the current tree to AMO for review on the listed channel.
//
// Runnable on its own, and used by scripts/send-for-review.mjs after it bumps
// the version. Exits non-zero if AMO already has this version, since AMO refuses
// a reused version string and the run would fail further in for a vaguer reason.

import { execFileSync } from "node:child_process";

import { ADDON_ID, VERSION, die, createJwt, fetchAddon, fetchVersion } from "./client.mjs";

// Asks about a specific version rather than the manifest's current one: after any
// release the current version is always on AMO, so checking that would refuse
// every subsequent submission.
export async function alreadySubmitted(version = VERSION) {
  const auth = await createJwt();
  const record = await fetchAddon(auth);
  if (!record) return false; // never submitted at all, so nothing is taken
  return Boolean(await fetchVersion(auth, record.id, version));
}

export function submit() {
  execFileSync(
    "npx",
    [
      "web-ext",
      "sign",
      "--source-dir",
      ".",
      "--channel=listed",
      "--amo-metadata=amo-metadata.json",
    ],
    { stdio: "inherit" }
  );
}

// Only self-executes when run directly, so send-for-review can import the parts.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (await alreadySubmitted()) {
    die(`AMO already has ${ADDON_ID} ${VERSION} — bump the version first`);
  }
  try {
    submit();
  } catch {
    // web-ext has already printed the reason; its 15-minute approval wait timing
    // out is a normal outcome, not a failure to submit.
    process.exit(1);
  }
}
