#!/usr/bin/env node
// Publishes the Mozilla-signed XPI as a GitHub Release.
//
// Run after `npm run submit:amo`. If that timed out waiting for review, the XPI
// is not on disk; this fetches it from AMO once the version is approved.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ADDON_ID, VERSION, addon, die, jwt, manifest, version } from "./amo.mjs";

const TAG = `v${VERSION}`;
const ARTIFACTS = "web-ext-artifacts";

// A signed XPI carries Mozilla's signature under META-INF. Publishing an unsigned
// build would give users a file release Firefox silently refuses to install.
function isSigned(file) {
  const listing = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" });
  return /^META-INF\/mozilla\.(rsa|sf)$/im.test(listing);
}

async function fetchFromAmo() {
  const auth = await jwt();
  const record = await addon(auth);
  if (!record) die(`${ADDON_ID} has never been submitted — run \`npm run submit:amo\``);

  const ver = await version(auth, record.id);
  if (!ver) die(`AMO has no version ${VERSION} for ${ADDON_ID}`);

  const status = ver.file?.status;
  if (status !== "public") {
    die(`version ${VERSION} is "${status}", not yet approved — nothing to release`);
  }
  if (!ver.file?.url) die(`AMO gave no download URL for ${VERSION}`);

  const out = path.join(ARTIFACTS, `clean_qr-${VERSION}-signed.xpi`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const dl = await fetch(ver.file.url, { headers: { Authorization: auth } });
  if (!dl.ok) die(`downloading the signed XPI failed with ${dl.status}`);
  fs.writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
  console.log(`downloaded ${out}`);
  return out;
}

function localXpi() {
  if (!fs.existsSync(ARTIFACTS)) return null;
  const found = fs
    .readdirSync(ARTIFACTS)
    .filter((f) => f.endsWith(".xpi") && f.includes(VERSION))
    .map((f) => path.join(ARTIFACTS, f));
  return found[0] ?? null;
}

const gh = (args, opts = {}) => execFileSync("gh", args, { encoding: "utf8", ...opts });

async function main() {
  try {
    gh(["auth", "status"], { stdio: "ignore" });
  } catch {
    die("gh is not authenticated — run `gh auth login`");
  }

  try {
    gh(["release", "view", TAG], { stdio: "ignore" });
    die(`release ${TAG} already exists — delete it or bump the version`);
  } catch (e) {
    if (String(e.message).includes("already exists")) throw e;
  }

  let xpi = localXpi();
  if (xpi) console.log(`using ${xpi}`);
  else {
    console.log("no signed XPI on disk; fetching from AMO…");
    xpi = await fetchFromAmo();
  }

  if (!isSigned(xpi)) die(`${xpi} is not Mozilla-signed — refusing to publish it`);

  const notes = [
    `Install from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/clean-qr/),`,
    `or download the signed \`.xpi\` below and open it in Firefox.`,
  ].join(" ");

  gh(["release", "create", TAG, xpi, "--title", `${manifest.name} ${VERSION}`, "--notes", notes], {
    stdio: "inherit",
  });
  console.log(`released ${TAG}`);
}

main();
