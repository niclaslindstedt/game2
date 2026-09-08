# Platforms

The repository is structured after its sibling game repo, which ships one product through many shells: web/PWA, desktop, and native mobile (App Store / Play Store). Scandinavian Flick adopts the same shape deliberately — the engine is headless and shell-agnostic, and every shell wraps the identical built site — and ships **three shells**: the web, a desktop app around it, and a store app for phones around it.

## Web / PWA (`pwa/`)

The deployed site IS the product. It is installable (home-screen app on iOS/Android, fullscreen launch), offline-capable (hand-rolled precaching service worker), self-updating (in-app prompt from `pwa/src/lib/pwa-update.ts`), and phone-first with full desktop keyboard support. Three deploy slots on [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/):

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
- **A window that remembers itself** — size, position, maximized and fullscreen, validated against the monitors actually attached — and fullscreen, which a webview cannot do on its own: F11 / Alt+Enter, and a FULLSCREEN row in the game's own options that only appears in here.
- **A RESOLUTION row that names real pixels** — `NATIVE`, `1440P`, `1080P` and down, cut to what the window is actually taller than, instead of the site's LOW/MEDIUM/HIGH share of a screen a web page is not allowed to see. A page decision (`pwa/src/game/desktop-video.ts`) gated on the shell's word, not a shell feature.
- **Links out open in the browser.** The window is pinned to its own origin; the repository link on the main menu and any credit open in the player's default browser rather than replacing the game.
- **A launch log**, because a packaged game has no console: every launch is written to `launch.log` in the app's user-data directory, and anything fatal is a dialog naming that file.

What it deliberately does NOT do: no platform seams (no store, no achievements, no cloud save), no bridge protocol, no second window. The page's view of the shell is one frozen global, `__SF_SHELL__`, plus one conversation — a fullscreen ask and the shell's answer, carried on two DOM events rather than a handle. All of it is `pwa/src/shell-host.ts`: the global keeps the PWA update lifecycle off (the bundle IS the update in there) and decides which picture rows the options page offers; the events are what the FULLSCREEN row presses. **Nothing in `engine/` learns the shell exists**, and the one file of `pwa/` that does is that one.

The tree is two Rust crates, and the split is the design: `tauri/shell/` is every DECISION (no Tauri, no GUI — its whole suite runs on a runner with a Rust toolchain and nothing else), `tauri/src-tauri/` is every EFFECT. `make tauri-test` and `make tauri-lint` check it; `.github/workflows/desktop-tauri.yml` runs both on every push that touches it, and `release.yml` packages a download per platform onto every release — created as a draft, made public only once all three are attached.

## Native mobile (`native/`) — App Store / Play Store

A **thin [Expo](https://expo.dev) / React Native wrapper** around the same built website, as in the sibling repo: one full-screen WebView, and nothing else on screen. The whole site is packed into the app (`native/assets/webroot.zip`, by `make native-bundle`) and served on launch from a local HTTP server on a fixed port, so the game plays offline and `localStorage` — campaign progress, the score boards, the ghost — keeps one origin across launches. [`native/README.md`](../native/README.md) is the tree.

What the shell adds around the page, and all of it: an audio session that plays through the iOS ringer switch, the phone's HAPTICS under a game that already knows what it wants felt, links out handed to the system browser, the Android back button kept inside the WebView's history, and the same frozen global the desktop app writes — `__SF_SHELL__`, here the word `"native"` (`pwa/src/shell-host.ts`) — so the PWA update lifecycle stays off, because an app bundled that way updates through the store rather than through a reload.

The haptics are the shape every later bridge takes, and they are a feature of the WEBSITE first: `pwa/src/game/rumble.ts` decides which moments of a run are felt and how big each is (hits and cars hard, the drift and the gearbox slight), `pwa/src/game/haptics.ts` plays that through the Vibration API wherever a browser has a motor, and only the pulse a WKWebView cannot play itself crosses the seam — described as a duration and a strength on one DOM event (`SHELL_RUMBLE`), relayed by the injected bridge, and spent by `native/src/rumble.ts` and `native/src/haptics.ts` on whatever taps the phone actually has. The player's switch is the website's own options row.

That is the whole of it for now. What the sibling's shell grew on top — cloud save, Game Center achievements and leaderboards (the engine's `RunStats` and event stream are the data source), the share sheet for the gallery's pictures, the store listing pipeline — each arrives as its own bridge module under `native/src/` with a flag on the WebView message channel, and the page's half behind a probe a browser answers too. Builds are manual (`.github/workflows/native.yml`, dispatch-only — EAS minutes are paid for) and never on push, and a store build is submitted by hand from that workflow rather than cut alongside a tag.

## Shipping to the stores

The two storefronts are fed from **one authored source**, because they describe
one game. The WORDS are `native/store/copy.mts`, which is **gitignored** —
the game is paid on the App Store and open source here, and a listing's prose
is the one thing those two facts pull apart — while the RULES (categories, the
age-rating answers, the Steam tags, what the page may not claim) are committed
in [`native/store/listing.mts`](../native/store/listing.mts). `make
store-metadata` compiles the pair into whatever each upload tool reads —
App Store Connect's `store.config.json`, the fastlane metadata tree, and
`tauri/store/steam-listing.md` to paste into Steamworks. It validates every
store's field limits and **fails rather than truncates**, because App Store
Connect truncates silently.

`make store-shots` captures the screenshot set at Apple's and Valve's exact
rasters, driving the real game to staged moments; `make store-sweep` is how each
frame's moment is chosen rather than guessed. `make store-preflight` answers
"are we ready to ship" for both storefronts at once, and marks which of the
remaining items wait on a store account nobody in this checkout can conjure.

The `store-listing` skill carries the craft and a map of every store file, and
the `store-shots` skill the pictures. Two documents own the rest:
[`native/store/README.md`](../native/store/README.md)
is the submission package and [`native/RELEASING.md`](../native/RELEASING.md) the
Apple/Play run-through; [`tauri/store/README.md`](../tauri/store/README.md) is
the Steam half. The `store-shots` skill owns the craft.

**The desktop shell has a Steam store page and no Steam INTEGRATION, and the
listing is built to keep those two straight.** `steam.notYetShipped` in the
listing names every feature the shell deliberately does not have — cloud save,
achievements, leaderboards, Workshop, multiplayer — and the generator **refuses
to emit a page whose copy mentions one**, because Valve reviews the page and the
build together. As the shell grows a feature, its row comes off that list and the
copy is free to say so.

## Deliberate differences from the sibling repo

- **One desktop shell, not two.** The sibling carries an Electron wrapper beside its Tauri one and measures the two against each other; this repo starts with the platform-webview shell alone. It has a Steam STORE PAGE and its downloads (`tauri/store/`, `make desktop`), but no Steam INTEGRATION: no capability stamp and no platform seams, so nothing in the page may claim one (see above). If a store build ever wants them, the sibling's three-file seam shape (bridge → provider → platform) is the template.
- **No modding seam.** The sibling ships a data-authored mod SDK; Scandinavian Flick keeps content as typed data in `engine/game/defs/` for now. If content authoring outgrows TypeScript rows, the path is the sibling's: YAML catalogs in `content/` compiled by a script — the defs modules are already the seam.
- **No multiplayer/server.** Stages are deterministic by seed, so the natural first social feature is asynchronous: shared daily seed (already in), then ghost times — no server shell until then.

When a further shell lands, it gets its own top-level directory, its packaging job slots into `release.yml`'s `desktop` matrix (or beside it), and this document describes it as it is.
