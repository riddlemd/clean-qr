# QR Code for Firefox

Generates a QR code for the current page, a link, an image, or selected text. Runs
entirely offline — nothing is ever sent to a server.

Works on Firefox desktop (macOS, Windows, Linux) and Firefox for Android.

## Status

Built and verified on Firefox 153 desktop: 0 lint findings, 18 passing unit tests.
Android export paths still need on-device testing — the clipboard, download, and
share paths all diverge from desktop and none can be verified in a desktop browser.

## Install for development

```bash
npm install
npm start          # launches Firefox with the extension loaded
npm run start:android -- --adb-device <id>
npm run lint       # web-ext lint
npm test           # unit tests for encoding and URL handling
```

## How it works

There is **no way for a WebExtension to add an entry to a native OS share sheet** on
macOS, Windows, or Android — no API exists on any platform. The extension therefore
uses Firefox's own surfaces:

| Surface | Desktop | Android |
| --- | --- | --- |
| Toolbar button + popup | yes | yes (full-window overlay) |
| Context menu (page/link/image/selection) | yes | no — the `menus` API doesn't exist on Fenix |
| Keyboard shortcut (`Ctrl/Cmd+Shift+Q`) | yes | no |
| Share to the OS share sheet | no — Web Share is flag-gated off | yes, via `navigator.share()` |

Android *is* reachable in the outbound direction: Fenix ships the Web Share API
unflagged, so the popup can hand the generated PNG to the Android share sheet.

Platform differences are resolved by feature detection in `src/lib/caps.js`, not by
user-agent sniffing, so the UI adapts as Firefox for Android gains APIs.

## Permissions

`activeTab`, `contextMenus`, `storage` — all three are on Mozilla's no-warning list,
so installing shows no permission prompt. Notably absent:

- **`downloads`** — would add a warning, and was removed from Firefox for Android in
  Fenix 79. Saving uses an object-URL `<a download>` instead.
- **`tabs`** — unnecessary; `activeTab` covers reading the current tab's URL in
  response to a user gesture.
- **host permissions** — the extension makes no network requests at all.

## Layout

```
manifest.json
src/
  background.js       event page: context menus, popup hand-off
  popup/              the single UI, shared by desktop and Android
  options/            settings
  lib/
    qr.js             encoding + automatic error-correction downgrade
    render.js         SVG for display, canvas for export
    target.js         URL normalization, tracking-parameter stripping
    caps.js           runtime feature detection
    theme.js          OS theme by default, explicit override
    settings.js       defaults and storage
    pending.js        context-menu → popup hand-off
  vendor/qrcode.mjs   qrcode-generator 2.0.4, unmodified (MIT)
test/                 unit tests for encoding and URL handling
```

**No build step.** `qrcode-generator` 2.0.4 ships zero-dependency native ESM, so the
extension ships as plain unbundled, unminified modules. This is deliberate: AMO
requires full source submission and byte-exact build reproduction for any minified or
bundled extension, and shipping readable source avoids that entirely.

## Theme

Follows the operating system's light/dark setting by default. Settings offers
**Auto / Light / Dark**; an explicit choice overrides the OS in both directions.

The QR code itself always renders dark-on-white regardless of theme — an inverted or
low-contrast code is a well-known scanner-failure mode, so the theme is not permitted
to reach it.

## Encoding

Defaults to error-correction level M. If a URL would push the code past version 12 —
roughly where on-screen scanning from a phone starts to fail — the error-correction
level is automatically lowered to buy back capacity, and the popup footer shows the
change rather than making it silently.

## License

MIT — see [`LICENSE`](LICENSE).

The vendored QR library, `qrcode-generator` by Kazuhiko Arase, is separately MIT
licensed and redistributed unmodified; its notice is at `src/vendor/LICENSE`.
