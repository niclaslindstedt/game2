---
title: `src-tauri` can be compile-checked in a web session — it needs GTK dev libraries, a webroot and the icons, and nothing else
date: 2026-09-07
scope: tauri/src-tauri/
concepts: [tauri, rust, build, harness, verification]
---

`make tauri-test` only covers `shell/`, so a change to the EFFECTS crate — a
command, the window handlers, the initialization script — ships to CI
unverified unless it is compiled here. It can be: `cargo check -p
scanflick-tauri` works in a web session once three things are in place, and
each fails with a message that reads like a dead end rather than a fixup.

1. **`pkg-config` cannot find `gdk-3.0`.** `apt-get install libgtk-3-dev
libwebkit2gtk-4.1-dev` — but run `apt-get update` FIRST, or half the
   archive 404s on stale package versions and the whole install aborts.
2. **`resource path ../webroot doesn't exist`** — the build script wants the
   bundled site. A directory with one `index.html` in it satisfies the check;
   a full `make build` + bundle is not needed just to compile.
3. **`failed to open icon .../32x32.png`** — `generate_context!` reads the
   icons at macro time. `node tauri/scripts/icons.mjs` writes them in a
   second, and `make tauri-lint` runs it anyway.

All three artifacts are gitignored, so the tree stays clean. After that,
`make tauri-lint` (clippy at `-D warnings` over both crates) is the real gate
and it is fast.

Two Rust facts this compile caught that a review would not: `WebviewWindow`'s
event handler is an `Fn`, so a value that has to persist between events needs
an `AtomicBool` (or a `Cell`) rather than a captured `mut`; and `eval` takes
its script as `&str`, so pass `script.as_str()` rather than the `String`.
