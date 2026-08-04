// Obtains the Mozilla-signed XPI for the current manifest version.
//
// `web-ext sign` downloads it only if review finishes inside its 15-minute wait,
// which it usually does not, so the file is often absent and has to be pulled
// from AMO afterwards.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ADDON_ID, VERSION, fetchAddon, die, createJwt, fetchVersion } from "./client.mjs";

const ARTIFACTS = "web-ext-artifacts";

// A signed XPI carries Mozilla's signature under META-INF. Publishing an unsigned
// build would hand users a file Firefox silently refuses to install.
export function isSigned(file) {
  const listing = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" });
  return /^META-INF\/mozilla\.(rsa|sf)$/im.test(listing);
}

function fromDisk() {
  if (!fs.existsSync(ARTIFACTS)) return null;
  const found = fs
    .readdirSync(ARTIFACTS)
    .filter((f) => f.endsWith(".xpi") && f.includes(VERSION))
    .map((f) => path.join(ARTIFACTS, f));
  return found[0] ?? null;
}

async function download() {
  const auth = await createJwt();
  const record = await fetchAddon(auth);
  if (!record) die(`${ADDON_ID} has never been submitted — run \`npm run submit:amo\``);

  const ver = await fetchVersion(auth, record.id);
  if (!ver) die(`AMO has no version ${VERSION} for ${ADDON_ID}`);

  const status = ver.file?.status;
  if (status !== "public") {
    die(`version ${VERSION} is "${status}", not yet approved — nothing to release`);
  }
  if (!ver.file?.url) die(`AMO gave no download URL for ${VERSION}`);

  const out = path.join(ARTIFACTS, `clean_qr-${VERSION}-signed.xpi`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const res = await fetch(ver.file.url, { headers: { Authorization: auth } });
  if (!res.ok) die(`downloading the signed XPI failed with ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${out}`);
  return out;
}

// Returns a path to a verified-signed XPI, or exits with a reason.
export async function getSignedXpi() {
  let file = fromDisk();
  if (file) console.log(`using ${file}`);
  else {
    console.log("no signed XPI on disk; fetching from AMO…");
    file = await download();
  }

  if (!isSigned(file)) die(`${file} is not Mozilla-signed — refusing to publish it`);
  return file;
}
