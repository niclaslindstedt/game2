// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PAGE'S WHOLE VIEW OF THE SHELL.
//!
//! It is one initialization script, evaluated before the game's own scripts on
//! every load, and it exposes exactly one thing: a frozen global saying which
//! binary is showing the page (`scanflick_shell::config::SHELL_GLOBAL`). The
//! page reads it in `pwa/src/shell-host.ts` to keep its PWA update lifecycle
//! off in here — the bundle is the update — and for nothing else.
//!
//! **The page never sees Tauri.** `withGlobalTauri` is off,
//! `capabilities/default.json` grants the window almost nothing, and the one
//! command it may reach is looked up at CALL time inside `send` rather than
//! captured here — so nothing in this script hands the game a handle it could
//! keep.

use scanflick_shell::config::{SHELL_GLOBAL, SHELL_ID};

/// The internal command the fullscreen key press invokes.
///
/// A webview has no native hook for a window-level key: F11 and Alt+Enter never
/// reach the native side at all. So the shell listens for them IN the page, on
/// the capture phase, and asks itself to toggle. It stays shell code either
/// way: the game has no fullscreen of its own to fight over, since the
/// Fullscreen API belongs to a browser chrome this window does not have.
pub const FULLSCREEN_COMMAND: &str = "shell_toggle_fullscreen";

/// The script the window is built with.
pub fn initialization_script() -> String {
    format!(
        r#"(function () {{
  Object.defineProperty(window, {SHELL_GLOBAL:?}, {{
    value: {SHELL_ID:?}, writable: false, configurable: false
  }});

  // The pipe is resolved on every call rather than captured: this script and
  // Tauri's own are both injected at document start, and depending on one
  // having run first is the kind of ordering that works until it doesn't.
  var send = function (command) {{
    var internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return;
    try {{ internals.invoke(command, {{}}); }} catch (e) {{ /* page tearing down */ }}
  }};

  // F11 / Alt+Enter — see FULLSCREEN_COMMAND. Capture phase, so a game that
  // swallows the key for its own reasons does not take the window's chrome
  // with it.
  window.addEventListener('keydown', function (event) {{
    if (event.key !== 'F11' && !(event.key === 'Enter' && event.altKey)) return;
    event.preventDefault();
    send({FULLSCREEN_COMMAND:?});
  }}, true);
}})();"#
    )
}
