# Platforms

The repository is structured after its sibling game repo, which ships one product through many shells: web/PWA, desktop, and native mobile (App Store / Play Store). Scandinavian Flick adopts the same shape deliberately — the engine is headless and shell-agnostic, and every shell wraps the identical built site — and ships **three shells**: the web, a desktop app around it, and a store app for phones around it.

## Web / PWA (`pwa/`)

The deployed site IS the product. It is installable (home-screen app on iOS/Android, fullscreen launch), offline-capable (hand-rolled precaching service worker), self-updating (in-app prompt via the oss-framework), and phone-first with full desktop keyboard support. Three deploy slots on [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/):

| Slot        | Serves                                        |
| ----------- | --------------------------------------------- |
| `/`         | The latest release (highest `v*` tag)         |
| `/preview/` | Current `main`, on every push                 |
| `/branch/`  | A feature branch parked via workflow dispatch |

Each slot is a whole build at its own base path with its own install identity, so the three can be installed side by side without fighting over one service-worker scope.

## Desktop (`tauri/`) — Windows, macOS, Linux

A **thin [Tauri](https://tauri.app) wrapper** around the built website: one window, in the platform's own webview (WebView2, WKWebView, WebKitGTK), showing the site bundled inside the app and served from a private `game://` scheme. No bundled browser engine, so the download is a few megabytes over the site itself. [`tauri/README.md`](../tauri/README.md) is the tree.

What the shell adds around the page, and all of it:

- **A stable origin.** The page is served from `game://localhost` (`http://game.localhost` on Windows), so the player's settings, high scores, ghosts and pictures — all origin-keyed browser storage — survive every update. A `file://` page would hand them a different origin at some point.
- **A window that remembers itself** — size, position, maximized and fullscreen, validated against the monitors actually attached — and F11 / Alt+Enter for fullscreen, which a webview cannot do on its own.
- **Links out open in the browser.** The window is pinned to its own origin; the repository link on the main menu and any credit open in the player's default browser rather than replacing the game.
- **A launch log**, because a packaged game has no console: every launch is written to `launch.log` in the app's user-data directory, and anything fatal is a dialog naming that file.

What it deliberately does NOT do: no platform seams (no store, no achievements, no cloud save), no bridge protocol, no second window. The page's whole view of the shell is one frozen global, `__SF_SHELL__` (`pwa/src/shell-host.ts`), which it reads to keep the PWA update lifecycle off — the bundle IS the update in there — and for nothing else. **Nothing in `engine/` learns the shell exists**, and the one line of `pwa/` that does is that read.

The tree is two Rust crates, and the split is the design: `tauri/shell/` is every DECISION (no Tauri, no GUI — its whole suite runs on a runner with a Rust toolchain and nothing else), `tauri/src-tauri/` is every EFFECT. `make tauri-test` and `make tauri-lint` check it; `.github/workflows/desktop-tauri.yml` runs both on every push that touches it, and `release.yml` packages a download per platform onto every release — created as a draft, made public only once all three are attached.

## Native mobile (`native/`) — App Store / Play Store

A **thin [Expo](https://expo.dev) / React Native wrapper** around the same built website, as in the sibling repo: one full-screen WebView, and nothing else on screen. The whole site is packed into the app (`native/assets/webroot.zip`, by `make native-bundle`) and served on launch from a local HTTP server on a fixed port, so the game plays offline and `localStorage` — campaign progress, the score boards, the ghost — keeps one origin across launches. [`native/README.md`](../native/README.md) is the tree.

What the shell adds around the page, and all of it: an audio session that plays through the iOS ringer switch, links out handed to the system browser, the Android back button kept inside the WebView's history, and the same frozen global the desktop app writes — `__SF_SHELL__`, here the word `"native"` (`pwa/src/shell-host.ts`) — so the PWA update lifecycle stays off, because an app bundled that way updates through the store rather than through a reload.

That is the whole of it for now. What the sibling's shell grew on top — haptics on the Taptic Engine, cloud save, Game Center achievements and leaderboards (the engine's `RunStats` and event stream are the data source), the share sheet for the gallery's pictures, the store listing pipeline — each arrives as its own bridge module under `native/src/` with a flag on the WebView message channel, and the page's half behind a probe a browser answers too. Builds are manual (`.github/workflows/native.yml`, dispatch-only — EAS minutes are paid for) and never on push, and a store build is submitted by hand from that workflow rather than cut alongside a tag.

## Deliberate differences from the sibling repo

- **One desktop shell, not two.** The sibling carries an Electron wrapper beside its Tauri one and measures the two against each other; this repo starts with the platform-webview shell alone, and there is no Steam edition, so the shell carries no capability stamp and no platform seams. If a store build ever wants them, the sibling's three-file seam shape (bridge → provider → platform) is the template.
- **No modding seam.** The sibling ships a data-authored mod SDK; Scandinavian Flick keeps content as typed data in `engine/game/defs/` for now. If content authoring outgrows TypeScript rows, the path is the sibling's: YAML catalogs in `content/` compiled by a script — the defs modules are already the seam.
- **No multiplayer/server.** Stages are deterministic by seed, so the natural first social feature is asynchronous: shared daily seed (already in), then ghost times — no server shell until then.

When a further shell lands, it gets its own top-level directory, its packaging job slots into `release.yml`'s `desktop` matrix (or beside it), and this document describes it as it is.
