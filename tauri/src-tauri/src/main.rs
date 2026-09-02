// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A game is started from an icon, so a Windows build must not also open a
// console window behind it. Debug builds keep one, because that is where the
// developer is reading the log.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Tauri desktop shell — as thin as a shell around a finished website can
//! be: one window showing the bundled game, served from a private scheme, plus
//! the one command the page may ask of it (a fullscreen toggle).
//!
//! The ORDER of the startup work matters, and two things happen before the
//! window exists:
//!
//!  1. **Is there a display at all** — asked before Tauri's builder, because
//!     the event-loop library unwraps a missing one (`scanflick_shell::display`).
//!  2. **The launch log is opened**, so the lines that matter most — the ones
//!     emitted immediately before the process dies — have somewhere to be.
//!
//! Everything security-shaped is deliberate and none of it is default: the
//! renderer is the whole game, so the page gets no Tauri API
//! (`withGlobalTauri` off), an almost-empty permission list
//! (`capabilities/default.json`), one command to reach the shell by, and a
//! window pinned to our own origin (`window::navigation_guard`).

mod page;
mod protocol;
mod window;

use std::path::PathBuf;

use scanflick_shell::config::{remote_game_url, user_data_dir, APP_SCHEME, SHELL_NOTICE};
use scanflick_shell::output;
use scanflick_shell::webroot::webroot_exists;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Everything the shell resolved before the window existed, held for the life
/// of the process.
pub struct Shell {
    /// Where this app keeps its own things (NOT the player's data — that
    /// belongs to the webview; see `scanflick_shell::config::APP_DIR_NAME`).
    pub user_data: PathBuf,
    /// Where the bundled site is.
    pub webroot: PathBuf,
}

/// F11 / Alt+Enter, forwarded from the page's own key handler — see
/// [`page::FULLSCREEN_COMMAND`] for why a webview cannot do this natively.
#[tauri::command]
fn shell_toggle_fullscreen(app: AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let full = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!full);
}

/// FAIL LOUDLY.
///
/// The failure mode this exists to end: the shell hits something it cannot
/// continue past, writes a line to a console the player does not have, and
/// exits — so the game "just doesn't launch". A dialog is the only surface a
/// player double-clicking an icon will ever see, so anything fatal gets one,
/// carrying the path of the log file that has the rest of the story in it.
fn fatal(app: &AppHandle, summary: &str) {
    output::error(summary);
    let log = output::log_path()
        .map(|path| format!("\n\nDetails were written to:\n{}", path.display()))
        .unwrap_or_default();
    app.dialog()
        .message(format!("{summary}{log}"))
        .kind(MessageDialogKind::Error)
        .title("The game could not start")
        .blocking_show();
    app.exit(1);
}

/// PUT A PANIC IN THE LAUNCH LOG.
///
/// A packaged game on Windows has no console: the default hook writes the one
/// line carrying the actual cause to a stream nobody is holding, so a shell
/// that panicked is, from the player's side, a program that did nothing. The
/// hook routes the same text through [`output`], which appends it to the launch
/// log — and the launch log is the whole of a bug report.
///
/// It does NOT swallow the default: the backtrace still goes where it always
/// went, for whoever has a terminal open.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "no message".to_string());
        output::error(&scanflick_shell::display::panic_report(
            &payload,
            info.location().map(std::string::ToString::to_string),
        ));
        previous(info);
    }));
}

fn main() {
    install_panic_hook();

    // A WINDOW SYSTEM THAT IS NOT THERE is the one fatal path with nowhere to
    // put a dialog — the thing that failed IS the window system. Asked before
    // Tauri's builder, because the handle is opened deep inside the event-loop
    // library, which unwraps it: without this, the answer to "why did the game
    // not start" is fourteen frames of somebody else's backtrace.
    if let Some(refusal) =
        scanflick_shell::display::refuse_windowless(std::env::consts::OS, &|name| {
            std::env::var(name).ok()
        })
    {
        output::error(&format!("The game could not start — {refusal}"));
        std::process::exit(1);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![shell_toggle_fullscreen])
        .register_uri_scheme_protocol(APP_SCHEME, |ctx, request| {
            // `try_state`: a request cannot arrive before the window is built,
            // and the window is built after the state is managed — but a 404
            // is the honest answer if that ordering is ever disturbed, where
            // `state()` would take the whole process down.
            match ctx.app_handle().try_state::<Shell>() {
                Some(shell) => protocol::serve(&request, &shell.webroot),
                None => protocol::not_found(request.uri().path()),
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let app_data_root = handle
                .path()
                .data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let user_data = user_data_dir(&app_data_root);
            // Before anything else can fail: give the launch somewhere to be
            // written down.
            output::log_to_file(&user_data);
            output::info(SHELL_NOTICE);
            let webroot = protocol::webroot_dir(&handle);

            if remote_game_url().is_none() && !webroot_exists(&webroot) {
                // Fatal rather than logged: from an installed copy this is a
                // broken install, and from a checkout it is a build step that
                // was skipped — either way, silence here reads as "the game
                // doesn't launch".
                fatal(
                    &handle,
                    &format!(
                        "No bundled website was found inside the app, so there is nothing \
                         to show.\n\nFrom a checkout, run `make tauri` from the repo root \
                         (it builds the site into tauri/webroot/). From an installed copy, \
                         this build is incomplete — please reinstall it.\n\nLooked in:\n{}",
                        webroot.display()
                    ),
                );
                return Ok(());
            }

            app.manage(Shell { user_data, webroot });
            let shell = app.state::<Shell>();
            if let Err(err) = window::build(&handle, &shell) {
                fatal(
                    &handle,
                    &format!("The game's window could not be opened — {err}"),
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the game's event loop could not start");
}
