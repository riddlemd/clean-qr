# AGENTS.md

Clean QR — a Firefox extension (MV3), plain unbundled ES modules, no build step.
Layout and feature docs are in [README.md](README.md); WHY-comments at the point of
use carry the code-level traps. This file holds only what lives nowhere else.

## RULES

1. **Run `npm test` and `npm run lint` before every commit.** Both must pass.
2. **After adding any file, confirm it doesn't ship**: web-ext bundles everything not
   in `webExt.ignoreFiles` (package.json). Check `unzip -Z1 web-ext-artifacts/*.zip`.
3. **Never run `npm run submit:amo` unless explicitly told to.** It submits a version
   to Mozilla; AMO refuses reused version strings, so a stray run permanently burns
   the number. `--dry-run` does NOT protect you — npm ignores it for `run` scripts.
4. **Do not commit or push unless asked.**

## Traps not visible at the point of edit

- **`browser.menus` requires the `"menus"` permission.** With `"contextMenus"` only
  `browser.contextMenus` exists, and every `browser.menus.*` call silently no-ops —
  the manifest is JSON, so nothing at the call sites warns about this.
- **Shortcut choices are constrained:** `Ctrl+Shift+Q` is Firefox Quit on
  Windows/Linux, `Cmd+Shift+Q` is macOS Log Out. `Alt+Shift+Q` is safe; Firefox maps
  Alt to Option on macOS, so no `"mac"` override is needed.

## AMO

- The extension ID (`clean-qr@riddlemd`) is permanent after the first submission.
- `update_url` and a listed submission are mutually exclusive; listed installs
  auto-update via AMO by ID, even when the XPI is downloaded from a GitHub Release.
- `web-ext sign` waits up to 15 minutes for review, then prints the dev-hub URL to
  fetch the signed XPI later — that timeout is not a failure.
- The first listed submission needs summary/category/license on the AMO dev hub.

## Android emulator

- Fenix needs **"Remote debugging via USB"** enabled in its settings before
  `web-ext run -t firefox-android` can connect (times out otherwise).
- Apple Silicon AVDs need the **arm64** APK (`INSTALL_FAILED_NO_MATCHING_ABIS` on
  x86_64). Nightly: taskcluster index
  `gecko.v2.mozilla-central.latest.mobile.fenix-nightly`, artifact
  `public/build/target.arm64-v8a.apk`.
- The emulator runs with `-no-snapshot-save`: Fenix, the extension, and the
  debugging toggle are all lost on shutdown and must be redone next boot.
