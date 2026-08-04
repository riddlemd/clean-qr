// Creates a GitHub Release. Knows nothing about where the file came from.

import { execFileSync } from "node:child_process";

const gh = (args, opts = {}) => execFileSync("gh", args, { encoding: "utf8", ...opts });

const die = (msg) => {
  console.error(`github: ${msg}`);
  process.exit(1);
};

// Split from publishRelease so the caller can fail before doing expensive work —
// there is no point downloading an XPI for a tag that already exists.
export function assertReleasable(tag) {
  try {
    gh(["auth", "status"], { stdio: "ignore" });
  } catch {
    die("gh is not authenticated — run `gh auth login`");
  }

  try {
    gh(["release", "view", tag], { stdio: "ignore" });
    die(`release ${tag} already exists — delete it or bump the version`);
  } catch (e) {
    // `gh release view` exits non-zero when the tag is free, which is what we want.
    if (String(e.message).includes("already exists")) throw e;
  }
}

export function publishRelease({ tag, file, title, notes }) {
  gh(["release", "create", tag, file, "--title", title, "--notes", notes], { stdio: "inherit" });
  console.log(`released ${tag}`);
}
