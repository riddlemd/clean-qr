#!/usr/bin/env node
// Derives every icon asset from icons/icon.svg:
//   icon-light.svg   the same glyph in light ink, for dark toolbars (theme_icons)
//   icon-{n}.png     raster sizes for about:addons, AMO and Android
//
// Needs librsvg: brew install librsvg

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SOURCE = "icons/icon.svg";
const DARK_INK = "#0c0c0d";
const LIGHT_INK = "#fbfbfe";
const SIZES = [16, 32, 48, 96, 128];

const die = (msg) => {
  console.error(`icons: ${msg}`);
  process.exit(1);
};

try {
  execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
} catch {
  die("needs librsvg (brew install librsvg)");
}

const source = fs.readFileSync(SOURCE, "utf8");
if (!source.includes(`fill="${DARK_INK}"`)) {
  die(`${SOURCE} no longer carries fill="${DARK_INK}" — the light variant would be wrong`);
}

fs.writeFileSync("icons/icon-light.svg", source.replace(`fill="${DARK_INK}"`, `fill="${LIGHT_INK}"`));

for (const size of SIZES) {
  execFileSync("rsvg-convert", ["-w", size, "-h", size, "-b", "none", SOURCE, "-o", `icons/icon-${size}.png`]);
}

console.log(`icons: icon-light.svg + PNG ${SIZES.join("/")}`);
