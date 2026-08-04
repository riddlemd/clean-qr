#!/usr/bin/env node
// Pushes the add-on-level fields of amo-metadata.json onto the live AMO listing.
//
// web-ext only sends that file during a version submission, so edits to it do not
// reach a listing whose version is already submitted. This closes that gap.

import { createRequire } from "node:module";

import { ADDON_ID, fetchAddon, die, createJwt } from "./client.mjs";

const require = createRequire(import.meta.url);
// `version` is version-level (license); everything else describes the listing.
const { version: _versionFields, ...listing } = require("../../amo-metadata.json");

if (!Object.keys(listing).length) die("amo-metadata.json has no listing fields to push");

const auth = await createJwt();
const record = await fetchAddon(auth);
if (!record) die(`${ADDON_ID} has never been submitted — run \`npm run submit:amo\``);

const dry = process.argv.includes("--dry-run");
console.log(`${dry ? "would push" : "pushing"} to ${record.slug}: ${Object.keys(listing).join(", ")}`);
if (dry) process.exit(0);

const res = await fetch(
  `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/`,
  {
    method: "PATCH",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(listing),
  }
);

if (!res.ok) {
  console.error(await res.text());
  die(`AMO returned ${res.status}`);
}

// Read back rather than trusting the write.
const after = await fetchAddon(await createJwt());
for (const key of Object.keys(listing)) {
  const value = after[key];
  const shown =
    value && typeof value === "object" && value["en-US"]
      ? `${value["en-US"].slice(0, 60).replace(/\n/g, " ")}…`
      : JSON.stringify(value);
  console.log(`  ${key}: ${shown}`);
}
console.log("listing updated");
