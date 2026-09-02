// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Where the desktop shell points itself, and what it is called.
//!
//! By default the app is self-contained: it serves the website copied inside it
//! (`webroot/`, a gitignored build artifact from `scripts/bundle-web.mjs`) over
//! a private scheme, so the game runs on-device and offline and updates only
//! when a new build ships.
//!
//! A launch-time override, `SF_GAME_URL`, points the window at a remote URL
//! instead (e.g. the `/preview/` deploy slot, for debugging against live
//! content). When set, the bundled webroot is skipped entirely.

use std::path::{Path, PathBuf};

/// The private scheme the bundled site is served from.
///
/// NOT `file://`: the site is built with `base: "/"`, so its absolute asset
/// paths and ES-module imports need a real origin to resolve against, and a
/// `file://` page is treated as an opaque origin — which would leave
/// `localStorage` and IndexedDB unable to keep the player's settings, scores,
/// ghosts and pictures between launches. A registered scheme gives one stable
/// origin that all of it is keyed to for the life of the install.
pub const APP_SCHEME: &str = "game";

/// The host the bundled site is served under.
///
/// `localhost`, and that is a platform fact rather than a preference: WebView2
/// maps a registered scheme onto `http://<scheme>.localhost`, so the host has
/// to be one the platform will accept in that shape. What matters is that it
/// is a CONSTANT — the origin is what the player's data is keyed to, so
/// changing this word later orphans every save on the machine.
pub const APP_HOST: &str = "localhost";

/// The page inside the bundle that the window opens on.
pub const APP_ENTRY: &str = "index.html";

/// The brand background (`PALETTE.sky` in `pwa/src/identity.ts`, the colour
/// the page's own body paints). It fills the window behind the page so no
/// white flash shows through while it loads.
pub const BRAND_BG: &str = "#3fa9f5";

/// What the window is called before the page has said otherwise —
/// `APP_NAME` in `pwa/src/identity.ts`, which `tests/tauri_test.ts` holds it to.
pub const WINDOW_TITLE: &str = "Scandinavian Flick";

/// The directory name under the OS's app-data root, and the name the app
/// reports for its own files (`launch.log`, `window-state.json`).
///
/// Tauri would name it after the bundle IDENTIFIER, a reverse-domain string
/// nobody has ever seen, while the executable is `scanflick` — so the folder
/// is declared here and is the executable's own name.
///
/// **What does NOT live here is the player's data**: `localStorage` and
/// IndexedDB belong to the WEBVIEW, which keeps its own store under the bundle
/// identifier. A window rect is ours; a high score is the web platform's.
pub const APP_DIR_NAME: &str = "scanflick";

/// The global the shell's initialization script defines on the page before
/// the game's own scripts run — the page's WHOLE view of the shell, and the
/// name `pwa/src/shell-host.ts` reads. Not a handle to anything: one frozen
/// word saying which binary is showing the page, which is what lets the page
/// keep its PWA update lifecycle off in here.
pub const SHELL_GLOBAL: &str = "__SF_SHELL__";

/// The word [`SHELL_GLOBAL`] carries.
pub const SHELL_ID: &str = "tauri";

/// This app's own directory under the OS's app-data root.
pub fn user_data_dir(app_data_root: &Path) -> PathBuf {
    app_data_root.join(APP_DIR_NAME)
}

/// A remote URL to load instead of the bundled site, or `None` to serve the
/// copy inside the app.
pub fn remote_game_url() -> Option<String> {
    std::env::var("SF_GAME_URL")
        .ok()
        .filter(|url| !url.is_empty())
}

/// The URL the window opens, given the origin the platform actually granted the
/// registered scheme.
///
/// Passed in rather than composed here, because the two desktop webviews spell
/// it differently — `game://localhost` on macOS and Linux, `http://
/// game.localhost` on Windows — and only the app crate knows which one it got.
pub fn start_url(origin: &str) -> String {
    format!("{}/{APP_ENTRY}", origin.trim_end_matches('/'))
}

/// Is this URL somewhere the game window may navigate to itself?
///
/// The site's own pages are same-origin and navigate normally; anything else —
/// the repository link on the main menu, a credit — opens in the player's
/// browser rather than replacing the game with a web page it cannot leave.
pub fn is_internal_url(url: &str, origin: &str, remote: Option<&str>) -> bool {
    let origin = origin.trim_end_matches('/');
    if url == origin || url.starts_with(&format!("{origin}/")) {
        return true;
    }
    remote.is_some_and(|remote| !remote.is_empty() && url.starts_with(remote))
}

/// WHICH BINARY THIS IS, said once per launch: a bug report about the desktop
/// game arrives with a launch log, and the log should say what wrote it.
pub const SHELL_NOTICE: &str = concat!(
    "This is the desktop build: the website, bundled and served from a private ",
    "scheme in the platform's own webview. See tauri/README.md."
);
