#!/usr/bin/env node
// Bumps the version, submits it to AMO, then commits and tags what was sent.
//
//   npm run send-for-review            patch: 1.0.0 -> 1.0.1
//   npm run send-for-review -- minor   1.0.0 -> 1.1.0
//   npm run send-for-review -- major   1.0.0 -> 2.0.0
//   npm run send-for-review -- --dry-run
//
// Submission happens before the commit on purpose. AMO rejects a submission for
// reasons that leave the version unused — a missing listing field, a validation
// error — and committing first would bury a version number that is still free.
// Submitting from the working tree means the commit records exactly what was sent.
//
// This is the one script here that pushes. By the time it does, the version is
// already with Mozilla, so the commit behind it should not stay on one machine.

import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { VERSION, die } from "./amo/client.mjs";
import { alreadySubmitted, submit } from "./amo/start-review.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const part = args.find((a) => !a.startsWith("-")) ?? "patch";

if (!["patch", "minor", "major"].includes(part)) die(`unknown bump "${part}" — patch, minor or major`);

const git = (a, opts = {}) => execFileSync("git", a, { encoding: "utf8", ...opts }).trim();
const run = (cmd, a) => execFileSync(cmd, a, { stdio: "inherit" });

function nextVersion(current, which) {
  const [major, minor, patch] = current.split(".").map(Number);
  if ([major, minor, patch].some(Number.isNaN)) die(`cannot parse version "${current}"`);
  if (which === "major") return `${major + 1}.0.0`;
  if (which === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Rewrites the version in place rather than round-tripping through JSON, which
// would reflow manifest.json and lose the blank lines between its sections.
function setVersion(file, version) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  if (after === before) die(`no version field replaced in ${file}`);
  fs.writeFileSync(file, after);
}

const next = nextVersion(VERSION, part);
const tag = `v${next}`;

console.log(`${VERSION} -> ${next}  (${part})`);

// Everything that can be checked before anything is changed, is.
if (git(["status", "--porcelain"])) die("working tree is dirty — commit or stash first");
if (git(["tag", "-l", tag])) die(`tag ${tag} already exists`);
if (await alreadySubmitted(next)) die(`AMO already has ${next} — choose a different bump`);

console.log("running tests and lint…");
if (!dry) {
  run("npm", ["test"]);
  run("npm", ["run", "lint"]);
}

if (dry) {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  console.log(`would bump manifest.json and package.json to ${next}`);
  console.log(`would submit to AMO, commit, tag ${tag}, and push both to ${branch}`);
  process.exit(0);
}

setVersion("manifest.json", next);
setVersion("package.json", next);

try {
  submit();
} catch {
  // Leave the bump uncommitted so it can be fixed and retried — the version was
  // never accepted, so it is still free.
  console.error(`\nsubmission failed; ${next} is still unused and the bump is uncommitted`);
  process.exit(1);
}

git(["add", "manifest.json", "package.json"]);
git(["commit", "-m", `Release ${next}`]);
git(["tag", "-a", tag, "-m", `Submitted to AMO as ${next}`]);

// Pushed because the version is already with Mozilla at this point: leaving the
// commit local would mean the published artefact has no public commit behind it.
// The branch and tag go separately rather than via --follow-tags, which would
// also drag along any other annotated tag reachable from here.
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
try {
  git(["push", "-u", "origin", branch], { stdio: "inherit" });
  git(["push", "origin", tag], { stdio: "inherit" });
  console.log(`\nsubmitted ${next}, committed, tagged ${tag}, pushed to ${branch}`);
} catch {
  console.error(`\npush failed — ${next} is submitted and committed locally as ${tag}.`);
  console.error(`Run: git push -u origin ${branch} && git push origin ${tag}`);
  process.exit(1);
}

console.log("next: npm run status:amo, then npm run release once approved");
