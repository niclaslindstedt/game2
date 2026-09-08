// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE MENU BAR, BUILT — the effects half of `scanflick_shell::menu`, which
//! carries every row, its wording and its binding. Nothing is DECIDED here:
//! this file turns that table into `tauri::menu` objects, hangs it on the app,
//! and spends each event on the one thing its row says.
//!
//! **macOS only, and the decision is a RUNTIME one inside [`install`] rather
//! than a `#[cfg]` around this module.** The bar belongs to the application on
//! macOS and is drawn whether an app asks for one or not, so there it is worth
//! building properly; Windows and Linux would draw it inside the game's own
//! window instead — a strip of chrome across the top of a full-screen racing
//! game, offering rows the player can already reach — so neither gets one.
//!
//! Compiled everywhere all the same, and that is the point: `make tauri-lint`
//! runs on Linux, and a `#[cfg(target_os = "macos")]` here would mean this
//! file was only ever typechecked on a machine nobody in CI has. The `if` it
//! costs at startup runs once.

use scanflick_shell::config::{site_link, SHELL_COMMAND};
use scanflick_shell::menu::{menu_bar, target_of, Entry, Native, Target};
use scanflick_shell::output;
use tauri::menu::{AboutMetadata, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager};

use crate::page::press;

/// Build the bar and hang it on the application.
///
/// Called before the window exists, because on macOS the menu belongs to the
/// process rather than to any window: built after, the first frames of the
/// game are shown under whatever bare default Tauri installed.
///
/// A no-op off macOS — see the module header for why that is a runtime check.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    if !cfg!(target_os = "macos") {
        return Ok(());
    }

    let about = AboutMetadata {
        name: Some(scanflick_shell::config::WINDOW_TITLE.into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        website: Some(scanflick_shell::config::SITE_URL.into()),
        ..Default::default()
    };

    let mut menus = Vec::new();
    for menu in menu_bar() {
        let mut items: Vec<Box<dyn IsMenuItem<_>>> = Vec::new();
        for entry in menu.entries {
            items.push(match entry {
                Entry::Separator => Box::new(PredefinedMenuItem::separator(app)?),
                Entry::Native(native) => native_item(app, *native, &about)?,
                Entry::Command(command) => Box::new(MenuItem::with_id(
                    app,
                    command.id,
                    command.label,
                    true,
                    command.accelerator,
                )?),
            });
        }
        let refs: Vec<&dyn IsMenuItem<_>> = items.iter().map(|item| item.as_ref()).collect();
        menus.push(Submenu::with_items(app, menu.title, true, &refs)?);
    }

    let refs: Vec<&dyn IsMenuItem<_>> = menus
        .iter()
        .map(|submenu| submenu as &dyn IsMenuItem<_>)
        .collect();
    app.set_menu(Menu::with_items(app, &refs)?)?;
    Ok(())
}

/// One row the platform draws and serves itself. `None` for a label is the
/// system's own wording, which is the point of asking for these by name.
fn native_item(
    app: &AppHandle,
    native: Native,
    about: &AboutMetadata,
) -> tauri::Result<Box<dyn IsMenuItem<tauri::Wry>>> {
    Ok(match native {
        Native::About => Box::new(PredefinedMenuItem::about(app, None, Some(about.clone()))?),
        Native::Services => Box::new(PredefinedMenuItem::services(app, None)?),
        Native::Hide => Box::new(PredefinedMenuItem::hide(app, None)?),
        Native::HideOthers => Box::new(PredefinedMenuItem::hide_others(app, None)?),
        Native::ShowAll => Box::new(PredefinedMenuItem::show_all(app, None)?),
        Native::Quit => Box::new(PredefinedMenuItem::quit(app, None)?),
        Native::CloseWindow => Box::new(PredefinedMenuItem::close_window(app, None)?),
        Native::Minimize => Box::new(PredefinedMenuItem::minimize(app, None)?),
        Native::Maximize => Box::new(PredefinedMenuItem::maximize(app, None)?),
        Native::Undo => Box::new(PredefinedMenuItem::undo(app, None)?),
        Native::Redo => Box::new(PredefinedMenuItem::redo(app, None)?),
        Native::Cut => Box::new(PredefinedMenuItem::cut(app, None)?),
        Native::Copy => Box::new(PredefinedMenuItem::copy(app, None)?),
        Native::Paste => Box::new(PredefinedMenuItem::paste(app, None)?),
        Native::SelectAll => Box::new(PredefinedMenuItem::select_all(app, None)?),
    })
}

/// Spend one menu event.
///
/// An id this app did not build is ignored rather than guessed at: the
/// platform's own rows arrive here too on some versions, and they have already
/// served themselves by the time they do.
pub fn pressed(app: &AppHandle, id: &str) {
    let Some(target) = target_of(id) else { return };
    match target {
        // The page's own button, pressed by name. Nothing comes back — see
        // `SHELL_COMMAND`.
        Target::Page(command) => {
            if let Some(window) = app.get_webview_window("main") {
                press(&window, SHELL_COMMAND, command);
            }
        }
        // The same switch the game's own FULLSCREEN row throws, so the two can
        // never disagree about what the window is doing.
        Target::Fullscreen => {
            if let Some(window) = app.get_webview_window("main") {
                let next = !window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(next);
                crate::page::announce_fullscreen(&window, next);
            }
        }
        // In the player's BROWSER. The window is pinned to its own origin, and
        // a policy page is not something to read inside a racing game.
        Target::Link(path) => {
            use tauri_plugin_opener::OpenerExt;
            let url = site_link(path);
            if let Err(err) = app.opener().open_url(&url, None::<&str>) {
                output::warn(&format!("could not open {url}: {err}"));
            }
        }
    }
}
