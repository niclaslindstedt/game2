// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Answering the `game://` scheme — the effects half of
//! `scanflick_shell::webroot`, which owns every decision this file acts on.
//!
//! Where the bundled site lives depends on the shape the app is in, and there
//! are exactly two:
//!
//! | Shape                       | `webroot/` is                                  |
//! | --------------------------- | ---------------------------------------------- |
//! | a checkout (`cargo run`)    | `tauri/webroot/`, beside the crate             |
//! | a packaged app              | in the bundle's resource directory             |
//!
//! `SF_WEBROOT` overrides both, which is what lets a build serve a site from
//! somewhere else without rebuilding — the same escape hatch `SF_GAME_URL`
//! gives for a REMOTE site.

use std::fs;
use std::path::{Path, PathBuf};

use scanflick_shell::output;
use scanflick_shell::webroot::{content_type_for, resolve_webroot_file};
use tauri::http::{Request, Response};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// Where the bundled site is, for this shape of app.
pub fn webroot_dir(app: &AppHandle) -> PathBuf {
    if let Some(override_dir) = std::env::var_os("SF_WEBROOT") {
        return PathBuf::from(override_dir);
    }
    // The packaged answer first, because a developer running a packaged build
    // has both trees on disk and only one of them is the one they installed.
    // The test is the site's own `index.html`: every packaged build has one,
    // or it is not a build of this game at all.
    if let Some(resource) = app
        .path()
        .resolve("webroot", BaseDirectory::Resource)
        .ok()
        .filter(|resource| resource.join("index.html").is_file())
    {
        return resource;
    }
    // A checkout: `src-tauri/` is one hop below the tree `bundle-web.mjs`
    // writes into, and `CARGO_MANIFEST_DIR` is resolved at compile time — which
    // is exactly right, since this branch only ever runs from that build.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|tree| tree.join("webroot"))
        .unwrap_or_else(|| PathBuf::from("webroot"))
}

/// The answer to a path that is not a file inside the webroot.
pub fn not_found(path: &str) -> Response<Vec<u8>> {
    output::warn(&format!("webroot: 404 {path}"));
    Response::builder()
        .status(404)
        .header("content-type", "text/plain; charset=utf-8")
        .body(b"Not found".to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Serve one request off the bundled site.
///
/// **Read whole rather than streamed**, which is a fact about the API rather
/// than a judgement: Tauri's synchronous protocol handler returns a body, not a
/// stream. The biggest thing in this site is a JavaScript chunk, so the cost
/// is one copy of one asset at a time; if a future asset makes that wrong, the
/// asynchronous handler is the seam to move to.
pub fn serve(request: &Request<Vec<u8>>, root: &Path) -> Response<Vec<u8>> {
    let path = request.uri().path();
    let Some(file) = resolve_webroot_file(path, root) else {
        return not_found(path);
    };
    let Ok(body) = fs::read(&file) else {
        return not_found(path);
    };
    Response::builder()
        .status(200)
        .header("content-type", content_type_for(&file))
        // The bundle is on local disk and is replaced wholesale by an update,
        // so revalidation buys nothing — but a stale cached index.html pointing
        // at hashed chunks from a previous build is a silent blue screen.
        .header("cache-control", "no-store")
        .body(body)
        .unwrap_or_else(|_| not_found(path))
}
