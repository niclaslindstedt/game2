// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Tauri's own build step: it reads `tauri.conf.json`, generates the permission
//! schemas the `capabilities/` files are checked against, and on Windows
//! compiles the resource block that carries the icon and version.
//!
//! It also REFUSES a missing bundle resource and a missing icon, which is why
//! `scripts/bundle-web.mjs` (or a placeholder `webroot/index.html`) and
//! `scripts/icons.mjs` have to have run before this crate compiles at all —
//! `npm run build` in this tree does both.

fn main() {
    tauri_build::build();
}
