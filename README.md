# Clean QR for Firefox

Generates a QR code for the current page, a link, an image, or selected text. Runs
entirely offline — nothing is ever sent to a server.

Works on Firefox desktop (macOS, Windows, Linux) and Firefox for Android.

## Screenshots

### Firefox desktop

| Popup | Context menu |
| --- | --- |
| <img src="docs/screenshots/desktop-popup.png" alt="Popup showing a QR code for the current page" width="360"> | <img src="docs/screenshots/desktop-menu.png" alt="Right-click menu with a Generate QR Code for Page entry" width="300"> |

<img src="docs/screenshots/desktop-options.png" alt="Settings, shown in the Firefox Add-ons Manager" width="660">

### Firefox for Android

| Popup | Browser menu | Settings |
| --- | --- | --- |
| <img src="docs/screenshots/android-popup.png" alt="Full-window QR code overlay on Android" width="220"> | <img src="docs/screenshots/android-menu.png" alt="Android browser menu with the extension listed" width="220"> | <img src="docs/screenshots/android-options.png" alt="Settings on Android" width="220"> |

The popup is one shared UI: a 360px panel anchored to the toolbar button on desktop,
and a full-window overlay on Android, where Web Share replaces the desktop clipboard
actions. In every shot the encoded URL is `https://example.com/?id=42` — the page was
loaded with a `utm_source` parameter that tracking-stripping removed before encoding.

## Install for development

```bash
npm install
npm start          # launches Firefox with the extension loaded
npm run start:android -- --adb-device <id>
npm run lint       # web-ext lint
npm test           # unit tests for encoding and URL handling
```

## How it works

| Surface | Desktop | Android |
| --- | --- | --- |
| Toolbar button + popup | yes | yes |
| Context menu (page/link/image/selection) | yes | no |
| Windows/Linux shortcut (`Alt+Shift+Q`) | yes | no |
| macOS shortcut (`Option+Shift+Q`, ⌥⇧Q) | yes | no |
| Share to the OS share sheet | no | yes |

## Permissions

| Permission | Used for |
| --- | --- |
| `activeTab` | Reading the current tab's URL when you invoke the extension |
| `menus` | The right-click entries for pages, links, images and selections |
| `storage` | Persisting your settings |
| `clipboardWrite` | Copy image / Copy URL, and auto-copy on open |

`clipboardWrite` is the only one that prompts. It is required rather than optional:
clipboard writes from an extension page need transient user activation without it, so
auto-copy-on-open — which fires with no click behind it — silently fails.

Notably absent:

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
