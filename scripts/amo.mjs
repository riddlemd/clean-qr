// Shared AMO API access. Credentials live in ~/.web-ext-config.mjs, outside the
// repo, and are the same ones web-ext uses.

import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
export const manifest = require("../manifest.json");
export const VERSION = manifest.version;
export const ADDON_ID = manifest.browser_specific_settings.gecko.id;

export function die(msg) {
  console.error(`amo: ${msg}`);
  process.exit(1);
}

export async function jwt() {
  const cfgPath = path.join(os.homedir(), ".web-ext-config.mjs");
  if (!fs.existsSync(cfgPath)) die(`no credentials at ${cfgPath}`);
  const { default: cfg } = await import(cfgPath);
  const { apiKey, apiSecret } = cfg.sign ?? {};
  if (!apiKey || !apiSecret) die("credentials file has no sign.apiKey/apiSecret");

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  // AMO rejects a reused jti, so it has to vary per call.
  const body = b64({ iss: apiKey, jti: `${now}-${process.pid}`, iat: now, exp: now + 120 });
  const sig = crypto.createHmac("sha256", apiSecret).update(`${head}.${body}`).digest("base64url");
  return `JWT ${head}.${body}.${sig}`;
}

export async function addon(auth) {
  const res = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/`,
    { headers: { Authorization: auth } }
  );
  if (res.status === 404) return null;
  if (!res.ok) die(`AMO returned ${res.status} fetching the add-on`);
  return res.json();
}

export async function version(auth, addonId, wanted = VERSION) {
  const res = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${addonId}/versions/?filter=all_with_unlisted`,
    { headers: { Authorization: auth } }
  );
  if (!res.ok) die(`AMO returned ${res.status} listing versions`);
  const { results } = await res.json();
  return results.find((v) => v.version === wanted) ?? null;
}
