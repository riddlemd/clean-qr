#!/usr/bin/env node
// web-ext only sends amo-metadata.json during a version submission, so edits to
// it do not reach a listing whose version is already submitted. This script
// closes that gap.

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

// Read back and diff rather than trusting the write. AMO rewrites some values on
// the way in — it HTML-escapes markup in description, so tags sent here come back
// as &lt;…&gt; and would render as literal text on the listing.
const after = await fetchAddon(await createJwt());
let altered = false;

for (const [key, sent] of Object.entries(listing)) {
  const stored = after[key];
  const flat = (v) => (v && typeof v === "object" && "en-US" in v ? v["en-US"] : JSON.stringify(v));
  const a = flat(sent);
  const b = flat(stored);
  console.log(`  ${key}: ${String(b).slice(0, 60).replace(/\n/g, " ")}…`);
  if (a !== b) {
    altered = true;
    console.warn(`    ! AMO stored something different (sent ${a.length}, stored ${b.length} chars)`);
  }
}

console.log(altered ? "listing updated, but AMO altered a value — check it" : "listing updated");
process.exit(altered ? 1 : 0);
