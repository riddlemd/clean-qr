#!/usr/bin/env node
// Exits 0 only when the version is approved, so it can gate: npm run status:amo && npm run release

import { ADDON_ID, VERSION, fetchAddon, createJwt, fetchVersion } from "./client.mjs";

const auth = await createJwt();
const record = await fetchAddon(auth);

if (!record) {
  console.log(`${ADDON_ID} has never been submitted — run \`npm run submit:amo\``);
  process.exit(1);
}

const ver = await fetchVersion(auth, record.id);
console.log(`add-on   ${record.slug}  (${record.status})`);

if (!ver) {
  console.log(`version  ${VERSION} not submitted`);
  process.exit(1);
}

const status = ver.file?.status ?? "unknown";
console.log(`version  ${VERSION}  (${status}, submitted ${ver.file?.created ?? "?"})`);

if (status === "public") {
  console.log("\napproved — run `npm run release` to publish the signed XPI");
  process.exit(0);
}

if (status === "disabled") {
  console.log("\nrejected or disabled — check the dev hub for the reviewer's notes");
  process.exit(1);
}

console.log(
  `\nstill in review. First listed submissions are queued for a human reviewer,` +
    `\nso hours to days is normal. An incomplete listing (missing summary or` +
    `\ndescription on the dev hub) can hold it up.`
);
process.exit(1);
