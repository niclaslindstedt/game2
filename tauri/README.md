<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Scandinavian Flick — the desktop app

A desktop wrapper around the game for **Windows, macOS and Linux**. It is a
thin [Tauri](https://tauri.app) shell whose entire content is the built
website, so the app **looks and plays exactly like the site** — and because
the site is bundled inside it and served from a private scheme, it plays
offline and is an app rather than a viewer for a web page.

The window uses the **platform's own webview** (WebView2 on Windows, WKWebView
on macOS, WebKitGTK on Linux) rather than carrying a browser engine of its
own, which is what keeps the download a few megabytes over the site itself.
What is added around the page is the short list a browser tab cannot give a
game and nothing more: one stable origin, a window that remembers itself, a
fullscreen key, links out that open in the browser, and a launch log.

---

## Layout — TWO crates, and the split is the design

| Path                        | What it is                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `shell/`                    | **Every decision.** No Tauri, no GUI, no window                                     |
| `shell/src/config.rs`       | The scheme, the host, the names, and what the window may navigate to                |
| `shell/src/webroot.rs`      | Which file one request path is — the containment check                              |
| `shell/src/window_state.rs` | Where the window opens, validated against the monitors attached                     |
| `shell/src/output.rs`       | Where a diagnostic line goes: stdout, and the launch log                            |
| `shell/src/display.rs`      | Whether there is anywhere to put a window, and what a panic should say              |
| `shell/tests/`              | Its whole test suite — runs anywhere a Rust toolchain does                          |
| `src-tauri/src/main.rs`     | The process: the builder, the one command, the lifecycle                            |
| `src-tauri/src/window.rs`   | The window, its geometry, and pinning it to our own origin                          |
| `src-tauri/src/protocol.rs` | Answering `game://` off the bundled `webroot/`                                      |
| `src-tauri/src/page.rs`     | The initialization script — the page's whole view of the shell                      |
| `src-tauri/capabilities/`   | **Tauri's own ACL** — what the window may reach. Deny by default                    |
| `src-tauri/tauri.conf.json` | The static half of the bundle's shape; `scripts/package.mjs` computes the rest      |
| `scripts/bundle-web.mjs`    | Builds the site and copies it to `webroot/` (gitignored)                            |
| `scripts/icons.mjs`         | Re-encodes `pwa/public/icons/`'s mark to the RGBA Tauri insists on, plus the `.ico` |
| `scripts/package.mjs`       | Packaging — this platform's downloads, into `release/`                              |

`cargo test -p scanflick-shell` therefore runs the entire decision layer on a
machine with **no GUI libraries installed at all**, which is what makes this
tree's logic coverable on an ordinary CI runner. The app crate has no tests of
its own by design — every decision lives in the library, which is the whole
reason for the split, and a test that would need one is a decision sitting in
the wrong crate.

---

## How the pieces fit

**The page barely learns it is inside this app.** One frozen global,
`__SF_SHELL__ = "tauri"`, is defined before the game's own scripts run
(`src-tauri/src/page.rs`), and `pwa/src/shell-host.ts` reads it to keep the
PWA update lifecycle off — the bundle IS the update in here, so a service
worker precaching it would only ever prompt about a build it already is.
Nothing else about the page changes, and nothing in `engine/` knows the shell
exists. The root suite (`tests/tauri_test.ts`) holds the global's name, the
window title and the bundle's description to `pwa/src/identity.ts`.

**The origin is the one thing to be careful with.** The player's settings,
high scores, ghosts and pictures live in origin-keyed browser storage, so
`APP_SCHEME` and `APP_HOST` are constants that must never be tidied. WebView2
maps a registered scheme onto `http://<scheme>.localhost`; WKWebView and
WebKitGTK serve it as a real `<scheme>://` URL. Both are one constant per
platform, which is the property that matters.

**The page never sees Tauri.** `withGlobalTauri` is off, the ACL grants the
window `core:default` and nothing else, and the one command the page may reach
(`shell_toggle_fullscreen`, off F11 / Alt+Enter) is looked up at call time
rather than captured. The dialog and opener plugins are called from Rust only.

**The window is pinned to its own origin.** The site's own pages navigate
normally; the repository link on the main menu and any credit open in the
player's browser rather than replacing the game with a page it cannot leave.
Which URLs count is `shell/src/config.rs`, which has the tests.

---

## Developing

Needs a **Rust toolchain** ([rustup](https://rustup.rs)) plus the platform's
webview development libraries — Tauri's own
[prerequisites](https://tauri.app/start/prerequisites/) page is the current
list per platform. On Debian/Ubuntu that is `libwebkit2gtk-4.1-dev`,
`libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` and `patchelf`;
on macOS the Xcode command line tools; on Windows the WebView2 runtime
(already present on Windows 11).

The root entry point builds the site into `tauri/webroot/`, compiles the
shell, and launches it:

```sh
make tauri                # from the repo root
npm run tauri             # the same thing
```

### Checking it

```sh
make tauri-test    # the decision layer — needs no GUI libraries
make tauri-lint    # clippy at zero warnings, BOTH crates (needs the libraries)
make tauri-fmt     # rustfmt in place
```

**Neither is on the root suite's path**: `make test` and `make lint` stop at
this tree's edge, because it has its own toolchain.
`.github/workflows/desktop-tauri.yml` runs both on every push that touches
`tauri/`, so a tree somebody forgot to check is a red PR rather than a
surprise. The root suite still reaches the static half — `tests/tauri_test.ts`
reads `tauri.conf.json` and the Rust constants as text.

`make tauri-lint` needs a `webroot/` and the icons to exist (`tauri-build`
refuses a missing bundle resource or icon before a line of code is looked at);
`npm run lint` in this tree makes the icons, and the workflow drops a one-line
placeholder page in as the webroot rather than building the site to typecheck
Rust.

### The launch log, when it does not start

The shell writes **every launch** to `launch.log` in its user-data directory
(`%APPDATA%\scanflick` on Windows, `~/Library/Application Support/scanflick` on
macOS, `~/.local/share/scanflick` on Linux), keeping the previous one beside it
as `launch.log.prev`. A packaged game has no console, so that file — plus the
error dialog anything fatal raises — is the whole diagnosis. Attach it to a bug
report. The window's remembered geometry (`window-state.json`) is the only
other thing there; the player's settings and scores are the webview's own.

### Environment

| Variable       | Effect                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `SF_GAME_URL`  | Load a remote URL instead of the bundled site (e.g. the `/preview/` slot) |
| `SF_WEBROOT`   | Serve the site from somewhere else without rebuilding                     |
| `SF_VERBOSE=1` | Keep the informational log in a release build                             |

---

## Packaging

```sh
make desktop                                      # this machine's downloads
make desktop ARGS="--target aarch64-apple-darwin" # an explicit target
```

`scripts/package.mjs` builds the site, makes the icons, runs `tauri build`
with the game's version (root `package.json`'s — the shell crate's own number
is never a release's) patched in, and collects the downloads into `release/`
as `scanflick-<version>-<os>-<arch>.<ext>`: a `.deb` and an `.AppImage` on
Linux, a `.dmg` on macOS, an NSIS `-setup.exe` on Windows.

**macOS is never signed with nothing** — Apple Silicon refuses to execute
unsigned arm64 code at all, so the default is an ad-hoc signature and
`APPLE_SIGNING_IDENTITY` is what a release sets instead. An ad-hoc build is
refused once by Gatekeeper (System Settings → Privacy & Security → Open
Anyway), which the release notes tell the player.

`release.yml` runs the same script on a runner per platform and attaches the
result to every release — created as a draft, made public only once all three
downloads are on it. `desktop-tauri.yml`'s dispatch does the same for one
platform without cutting a version.
