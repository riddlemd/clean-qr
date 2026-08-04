#!/usr/bin/env node
// Publishes the Mozilla-signed XPI as a GitHub Release.
//
// Run after `npm run submit:amo`. If that timed out waiting for review, the XPI
// is not on disk; this fetches it from AMO once the version is approved.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const manifest = require("../manifest.json");
const VERSION = manifest.version;
const ADDON_ID = manifest.browser_specific_settings.gecko.id;
const TAG = `v${VERSION}`;
const ARTIFACTS = "web-ext-artifacts";

const die = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

function amoJwt() {
  const cfgPath = path.join(os.homedir(), ".web-ext-config.mjs");
  if (!fs.existsSync(cfgPath)) die(`no AMO credentials at ${cfgPath}`);
  return import(cfgPath).then(({ default: cfg }) => {
    const { apiKey, apiSecret } = cfg.sign ?? {};
    if (!apiKey || !apiSecret) die("credentials file has no sign.apiKey/apiSecret");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: "HS256", typ: "JWT" });
    const body = b64({ iss: apiKey, jti: `${now}-release`, iat: now, exp: now + 120 });
    const sig = crypto.createHmac("sha256", apiSecret).update(`${head}.${body}`).digest("base64url");
    return `JWT ${head}.${body}.${sig}`;
  });
}

// A signed XPI carries Mozilla's signature under META-INF. Publishing an unsigned
// build would give users a file release Firefox silently refuses to install.
function isSigned(file) {
  const listing = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" });
  return /^META-INF\/mozilla\.(rsa|sf)$/im.test(listing);
}

async function fetchFromAmo() {
  const jwt = await amoJwt();
  const res = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/?filter=all_with_unlisted`,
    { headers: { Authorization: jwt } }
  );
  if (!res.ok) die(`AMO returned ${res.status} listing versions`);
  const { results } = await res.json();
  const version = results.find((v) => v.version === VERSION);
  if (!version) die(`AMO has no version ${VERSION} for ${ADDON_ID}`);

  const status = version.file?.status;
  if (status !== "public") {
    die(`version ${VERSION} is "${status}", not yet approved — nothing to release`);
  }
  if (!version.file?.url) die(`AMO gave no download URL for ${VERSION}`);

  const out = path.join(ARTIFACTS, `clean_qr-${VERSION}-signed.xpi`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const dl = await fetch(version.file.url, { headers: { Authorization: jwt } });
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
