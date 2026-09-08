---
title: Never `#[cfg(target_os = …)]` a module in `src-tauri` — CI runs on Linux, so the cfg is the same as not typechecking it
date: 2026-09-08
scope: tauri/src-tauri/
concepts: [tauri, rust, macos, verification, harness]
---

The macOS menu bar landed as `#[cfg(target_os = "macos")] mod menu;`, which
reads like care and is the opposite: `make tauri-lint` and
`.github/workflows/desktop-tauri.yml` both run on **Linux**, so a cfg'd-out
module is never compiled by anything anybody runs. It would have shipped
whatever it happened to contain.

Compile it everywhere and make the platform check a **runtime `if`** in the
entry point instead:

```rust
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
```

`cfg!` is an expression, so the whole body still typechecks on every platform,
there is no dead code for `-D warnings` to object to, and the branch costs one
comparison at startup. The same applies to any future platform-shaped module.

**Two things this caught the moment it compiled**, neither of which a review
would have:

- **The effects crate is not generic over its runtime.** `page.rs` and
  `window.rs` take the concrete `WebviewWindow` (that is `WebviewWindow<Wry>`),
  so a new module written the textbook way — `fn install<R: Runtime>(app:
  &AppHandle<R>)` — does not compose with them and fails with a
  `WebviewWindow` vs `WebviewWindow<R>` mismatch at every call. Match the
  crate: concrete `AppHandle`, and `Box<dyn IsMenuItem<tauri::Wry>>` where a
  trait object is needed.
- **`missing_docs` is on for `scanflick-shell`.** Every enum VARIANT and struct
  FIELD in a new public type needs a doc comment, or `make tauri-lint` fails at
  `-D warnings` — 22 of them at once, none of which `cargo test` mentions.

So the loop for anything in this crate is still the one in
`1788760049-cargo-check-the-effects-crate.md`, plus: if the new code is
platform-gated, **lift the gate before checking it**, or write it so there is
no gate to lift.
