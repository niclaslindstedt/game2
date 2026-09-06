---
name: platform-shells
description: "Use when working on the DESKTOP app (`tauri/`) or the STORE app (`native/`) — the window, the private `game://` scheme, the bundled webroot, the ACL, packaging a download, the Expo WebView, the audio session, a native bridge, or anything the page needs to know about the shell it is running in. Owns the decision/effect split in the two Rust crates, the frozen `__SF_SHELL__` global, the names that restate `identity.ts` and cannot import it, and the rule that a feature the shells need is a feature the WEBSITE needs first. Both trees live outside the npm workspace, so `make lint` and `make test` do not reach them."
---

# The platform shells: the desktop app and the store app

The product is the deployed website. The two shells wrap it — they add a
window, an offline copy and a store listing, and **nothing else**. Every rule
in this skill exists to keep that true, because the moment a feature lives
only inside a shell, the website is no longer the product.

**The load-bearing constraint:** nothing in `engine/` may learn either shell
exists, and the ONE line of `pwa/` that does is `pwa/src/shell-host.ts` — the
page reads a frozen global to keep its PWA update lifecycle off in there, and
nothing else about the page changes. A feature the desktop or store app needs
is a feature the website needs first; a shell-only behaviour is a decision in
the shell's own tree with a test beside it.

**Read this skill's lessons first** — `node scripts/skill-lessons.mjs
platform-shells --list`. Load **`skill-reflection`** at both ends and
**`write-code`** beside this one.

## `tauri/` — the desktop app (Windows, macOS, Linux)

A thin wrapper around the built site in the platform's own webview, served
from a private `game://` scheme. **Two Rust crates, and the split is the
design:**

- **`shell/` is every DECISION** — the scheme and host, the window's names,
  what the window may navigate to, which file a request path is (the
  containment check), where the window opens against the attached monitors,
  where a diagnostic line goes. No Tauri, no GUI: `make tauri-test` runs its
  whole suite with a Rust toolchain and nothing else. **A `use tauri::` in
  this crate is the review comment.**
- **`src-tauri/` is every EFFECT** — the process and its builder, the window
  and its geometry, answering `game://` off the bundled `webroot/`, the
  initialization script that is the page's whole view of the shell, and the
  one command. What the page may reach is the ACL in
  `src-tauri/capabilities/`, which denies by default.

Bundling, icons and packaging are `tauri/scripts/{bundle-web,icons,package}.mjs`
(Node, no deps); the static half of the bundle's shape is
`src-tauri/tauri.conf.json`. `.github/workflows/desktop-tauri.yml` runs the
checks on every push that touches the tree, and `release.yml`'s `desktop`
matrix packages it onto every release. → `tauri/README.md`.

```sh
make tauri        # bundle the site into tauri/webroot/, compile, launch (needs Rust)
make tauri-test   # the decision layer's suite — Rust toolchain only, NOT on `make test`'s path
make tauri-lint   # clippy at zero warnings over both crates (needs the webview dev libraries)
make tauri-fmt    # rustfmt in place
make desktop      # package this machine's downloads into tauri/release/
```

## `native/` — the App Store / Play Store app

A thin Expo / React Native shell whose entire content is a full-screen WebView
over a copy of the built site bundled inside the app (`assets/webroot.zip`),
served off a local HTTP server on a **fixed port so `localStorage` keeps its
origin**. On top of the web game it adds only what a browser cannot give a
phone: an audio session that plays through the iOS ringer switch, and
store-driven updates.

It has **its own dependency tree, outside the npm workspace** — `make lint` and
`make test` do not reach it. `make native-typecheck` does, and the root suite
tests its pure modules (`src/navigation.ts` and the injected script's word).
Built on demand only, by the `native` workflow or `npm run native:*`; never on
push. → `native/README.md`.

```sh
make native-bundle    # pack the built site into native/assets/webroot.zip — before EVERY native build
make native-install   # its own dependency tree
make native-ios       # on an iOS simulator (native-android for Android)
make native-typecheck # tsc over the shell — its own tree, so `make lint` does not reach it
```

**Anything the store app does that a browser can't** is a bridge module under
`native/src/<service>.ts`, driven off the WebView message channel, with the
page's half behind a probe the browser answers too — never a line in `engine/`
or `pwa/`.

## The two things stated twice

- **The shell's word.** `pwa/src/shell-host.ts` holds one frozen global with
  one word per shell; the desktop app writes `"tauri"` from
  `src-tauri/src/page.rs`, the store app writes `"native"` from
  `native/src/injected.ts`. `tests/tauri_test.ts` holds the global's name to
  the Rust constant.
- **The names.** The desktop app cannot import `identity.ts`, so
  `productName` and `longDescription` in `tauri/src-tauri/tauri.conf.json` and
  `WINDOW_TITLE` in `tauri/shell/src/config.rs` are `APP_NAME` /
  `APP_DESCRIPTION` spelled again, and `SHELL_GLOBAL` there is
  `shell-host.ts`'s. `tests/tauri_test.ts` holds all four — a rename touches
  every one of them in the same change. `native/app.config.js` is the
  exception: it READS its name and sky off `identity.ts` and restates nothing.

## Documentation sync

A change to the desktop app's tree or its environment variables updates
`tauri/README.md`, `docs/configuration.md` (the launch environment) and
`docs/platforms.md`. A native bridge or build knob updates `native/README.md`
and `docs/configuration.md` (the `EXPO_*` rows). Shell and platform plans live
in `docs/platforms.md`.
