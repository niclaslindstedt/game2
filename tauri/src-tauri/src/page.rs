// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PAGE'S WHOLE VIEW OF THE SHELL.
//!
//! It is one initialization script, evaluated before the game's own scripts on
//! every load, and it exposes exactly two things: a frozen global saying which
//! binary is showing the page (`scanflick_shell::config::SHELL_GLOBAL`), and a
//! conversation about the window's fullscreen carried on two DOM events
//! (`SHELL_FULLSCREEN_ASK` / `SHELL_FULLSCREEN_STATE`). The page reads the
//! global in `pwa/src/shell-host.ts` to keep its PWA update lifecycle off in
//! here — the bundle is the update — and holds the other half of the
//! conversation there too, behind the FULLSCREEN row in the game's options.
//!
//! One thing crosses the other way with no script at all: when a macOS menu
//! row is chosen, the shell PRESSES one of the game's own buttons by name
//! ([`press`], on `SHELL_COMMAND`). Told rather than asked, and nothing comes
//! back — a menu bar is a second way to reach buttons the page already has.
//!
//! **The page never sees Tauri.** `withGlobalTauri` is off,
//! `capabilities/default.json` grants the window almost nothing, and the one
//! command it may reach is looked up at CALL time inside `send` rather than
//! captured here — so nothing in this script hands the game a handle it could
//! keep. An ask is a word, the answer is an event, and neither is a handle.

use scanflick_shell::config::{
    SHELL_FULLSCREEN_ASK, SHELL_FULLSCREEN_STATE, SHELL_GLOBAL, SHELL_ID,
};
use tauri::WebviewWindow;

/// The internal command every fullscreen ask invokes, with one argument: the
/// word `on`, `off`, `toggle` or `state`.
///
/// A webview has no native hook for a window-level key either: F11 and
/// Alt+Enter never reach the native side at all. So the shell listens for them
/// IN the page, on the capture phase, and asks itself to toggle — the same
/// command the game's own switch reaches, so the two can never disagree about
/// what the window is doing.
pub const FULLSCREEN_COMMAND: &str = "shell_fullscreen";

/// Tell the page where the window now stands.
///
/// PUSHED rather than returned, because the page is not the only thing that
/// changes it: F11, the window manager and the macOS green button all move the
/// window without the game asking, and every one of them comes back through
/// this one event.
pub fn announce_fullscreen(window: &WebviewWindow, on: bool) {
    let script = format!(
        "window.dispatchEvent(new CustomEvent({SHELL_FULLSCREEN_STATE:?}, \
         {{ detail: {{ on: {on} }} }}))"
    );
    let _ = window.eval(script.as_str());
}

/// Press one of the game's own buttons, by name.
///
/// The menu bar's whole channel into the page, and the only thing this shell
/// says without being asked first. A word on an event and nothing back: a
/// command the game cannot serve where it stands is a command it ignores, and
/// a page that has torn down hears nothing at all.
///
/// The word goes through `{:?}` rather than being quoted by hand, like every
/// other value in this file: the format string is a JavaScript PROGRAM, and
/// Rust's debug spelling of a `&str` is a quoted, escaped JavaScript string
/// literal. There is no other escaping in here, and there must not need to be.
pub fn press(window: &WebviewWindow, event: &str, command: &str) {
    let script = format!(
        "window.dispatchEvent(new CustomEvent({event:?}, \
         {{ detail: {{ command: {command:?} }} }}))"
    );
    let _ = window.eval(script.as_str());
}

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
  var send = function (want) {{
    var internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return;
    try {{ internals.invoke({FULLSCREEN_COMMAND:?}, {{ want: want }}); }}
    catch (e) {{ /* page tearing down */ }}
  }};

  // The game's own FULLSCREEN switch, and the read that tells it where the
  // window stands. Every ask is answered the same way, on SHELL_FULLSCREEN_STATE.
  window.addEventListener({SHELL_FULLSCREEN_ASK:?}, function (event) {{
    var want = event && event.detail && event.detail.want;
    send(want === 'on' || want === 'off' || want === 'toggle' ? want : 'state');
  }});

  // F11 / Alt+Enter — see FULLSCREEN_COMMAND. Capture phase, so a game that
  // swallows the key for its own reasons does not take the window's chrome
  // with it.
  window.addEventListener('keydown', function (event) {{
    if (event.key !== 'F11' && !(event.key === 'Enter' && event.altKey)) return;
    event.preventDefault();
    send('toggle');
  }}, true);
}})();"#
    )
}
