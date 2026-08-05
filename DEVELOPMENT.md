# Development

Everything needed to run, test and release Clean QR. For what the extension does and
why, see [README.md](README.md).

## Getting started

```bash
npm install
npm start                            # Firefox with the extension loaded
npm run start:android -- --adb-device <id>
npm test                             # unit tests, no browser needed
npm run lint                         # web-ext lint
npm run build                        # zip into web-ext-artifacts/
npm run icons                        # regenerate icon assets (needs librsvg)
```

`npm test` and `npm run lint` should both pass before every commit.

Running on Android needs **"Remote debugging via USB"** enabled in Fenix's own settings
first, or `web-ext run -t firefox-android` simply times out trying to connect.

## No build step

`qrcode-generator` 2.0.4 ships zero-dependency native ESM, so the extension ships as
plain unbundled, unminified modules. This is deliberate: AMO requires full source
submission and byte-exact build reproduction for any minified or bundled extension, and
shipping readable source avoids that entirely.

The one modification is at runtime: the vendored library truncates each UTF-16 code unit
to a single byte, so `qr.js` replaces its byte converter with `TextEncoder`. Without
that, any non-ASCII selection encodes to mojibake.

## Layout

```
manifest.json
src/
  background.js       event page: context menus, popup hand-off
  popup/              the single UI, shared by desktop and Android
  options/            settings
  lib/
    qr.js             encoding, error-correction downgrade, density ceilings
    render.js         SVG for display, canvas for export, data URIs
    target.js         URL cleaning, selection typing, text fragments
    caps.js           runtime feature detection
    theme.js          OS theme by default, explicit override
    settings.js       defaults and validation
    pending.js        context-menu → popup hand-off
    history.js        recent codes, when enabled
  vendor/qrcode.mjs   qrcode-generator 2.0.4, unmodified (MIT)
test/                 unit tests; stub-browser.js fakes the browser.* APIs
scripts/              release tooling, not shipped in the XPI
```

Platform differences between desktop and Android are resolved by feature detection in
`src/lib/caps.js`, not by user-agent sniffing, so the UI adapts as Firefox for Android
gains APIs rather than needing a new release.

Anything added to the tree ships unless it is listed in `webExt.ignoreFiles` in
`package.json` — `unzip -Z1 web-ext-artifacts/*.zip` shows what actually went in.

## Releasing

```bash
npm run send-for-review          # bump, submit to AMO, commit, tag, push
npm run status:amo               # where the submitted version sits in review
npm run release                  # signed XPI -> GitHub Release, once approved
npm run push-listing:amo         # push amo-metadata.json to the live listing
```

Submission runs before the commit deliberately: AMO rejects for reasons that leave the
version unused, and committing first would bury a version number that is still free.

`status:amo` exits non-zero until the version is approved, so
`npm run status:amo && npm run release` is safe to chain.

Submitting burns a version number permanently — AMO refuses a reused version string, so
a submission that is never approved still costs that number. `--dry-run` does not
protect against this when passed through `npm run`, which drops the flag.

AMO credentials live in `~/.web-ext-config.mjs`.
