// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE MENU BAR, AS DATA — every row the desktop app offers, what it is
//! called, what it is bound to, and who serves it. Nothing here draws a menu:
//! `src-tauri/src/menu.rs` turns this into a real one, and it is the only file
//! in the tree that knows what a `tauri::menu::Menu` is.
//!
//! **Why a game has a menu bar at all.** On macOS the menu bar is the
//! application, not the window: an app that declares no menu still gets one,
//! bare, carrying its name and a Quit. That bar is what a Mac App Store
//! reviewer sees first, and an empty one reads as a web page in a frame —
//! which is the exact reading guideline 4.2 is about. Windows and Linux draw
//! no bar for this app at all, so everything below is macOS's alone.
//!
//! **THE ONE RULE THE ROWS OBEY: a menu row may only press a button the game
//! already has.** A shell is allowed to add a window, an offline copy and a
//! store listing, and nothing else — so no row here opens a surface the
//! website does not have, and the words it sends
//! ([`config::SHELL_COMMAND`](crate::config::SHELL_COMMAND)) are spelled again
//! in `pwa/src/shell-host.ts`, with `tests/tauri_test.ts` holding the two
//! lists together.
//!
//! **What is NOT here, and why:**
//!
//! - **A File menu.** There are no files: a run is not a document, nothing is
//!   opened and nothing is saved by name. The second menu is RACE, which is
//!   what its rows are actually about. Apple's own games do the same.
//! - **A bare-key accelerator.** Every binding below carries ⌘. The game reads
//!   the keyboard directly and a menu accelerator wins before the page ever
//!   sees the key, so binding a naked Escape or P to a row would quietly take
//!   that key away from the car.
//! - **Enable/disable state.** A row the game cannot serve where it stands
//!   does nothing rather than greying out, because greying out means the shell
//!   tracking what the page is showing — a whole second copy of the game's
//!   state, kept in a language that cannot see it.

use crate::config::WINDOW_TITLE;

/// A row the platform draws and serves itself.
///
/// Named rather than spelled out because macOS owns both the wording and the
/// behaviour: "Hide Scandinavian Flick" is localized by the system, and
/// `Cut`/`Copy`/`Paste` reach the focused text field through the responder
/// chain, which nothing in a webview can do from the outside.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Native {
    /// The About box, filled from the bundle's own name and version.
    About,
    /// The system's Services submenu.
    Services,
    /// Hide this application.
    Hide,
    /// Hide every other application.
    HideOthers,
    /// Bring everything back.
    ShowAll,
    /// Quit, with the platform's own binding.
    Quit,
    /// Close the front window — which for this app is the game.
    CloseWindow,
    /// Send the window to the Dock.
    Minimize,
    /// The green button's zoom.
    Maximize,
    /// Undo in the focused text field.
    Undo,
    /// Redo in the focused text field.
    Redo,
    /// Cut from the focused text field.
    Cut,
    /// Copy from the focused text field.
    Copy,
    /// Paste into the focused text field.
    Paste,
    /// Select everything in the focused text field.
    SelectAll,
}

/// Who serves a row this crate declares.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// The word travels to the page and presses one of the game's own buttons.
    Page(&'static str),
    /// The window's own fullscreen — the shell's, because a webview cannot
    /// reach it (see [`config::SHELL_FULLSCREEN_ASK`](crate::config::SHELL_FULLSCREEN_ASK)).
    Fullscreen,
    /// A page of the website, opened in the player's BROWSER rather than in
    /// this window. Held as a path and joined onto
    /// [`config::SITE_URL`](crate::config::SITE_URL) by
    /// [`site_link`](crate::config::site_link), so the domain is written once.
    Link(&'static str),
}

/// A row this crate declares, as opposed to one the platform owns.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Command {
    /// The id the menu event arrives under. Unique across the whole bar.
    pub id: &'static str,
    /// What the row reads, in the bar.
    pub label: &'static str,
    /// Tauri's accelerator spelling, or `None` for a row with no binding.
    pub accelerator: Option<&'static str>,
    /// What choosing it does, and who does it.
    pub target: Target,
}

/// One row of a menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Entry {
    /// A dividing line. Never first or last in a menu — the tests say so.
    Separator,
    /// A row the platform draws and serves.
    Native(Native),
    /// A row this app declares and serves.
    Command(Command),
}

/// One menu on the bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Menu {
    /// What the bar calls it. The first menu takes the application's name.
    pub title: &'static str,
    /// Its rows, top to bottom.
    pub entries: &'static [Entry],
}

/// Shorthand for a row this crate serves.
const fn command(
    id: &'static str,
    label: &'static str,
    accelerator: Option<&'static str>,
    target: Target,
) -> Entry {
    Entry::Command(Command {
        id,
        label,
        accelerator,
        target,
    })
}

/// The game's own pages, reached by name. Each word is a button the player can
/// already press; `pwa/src/shell-host.ts` lists the same set.
const APP_MENU: &[Entry] = &[
    Entry::Native(Native::About),
    Entry::Separator,
    command(
        "settings",
        "Settings…",
        Some("CmdOrCtrl+,"),
        Target::Page("settings"),
    ),
    Entry::Separator,
    Entry::Native(Native::Services),
    Entry::Native(Native::Hide),
    Entry::Native(Native::HideOthers),
    Entry::Native(Native::ShowAll),
    Entry::Separator,
    Entry::Native(Native::Quit),
];

/// RACE, not File — see the module header.
const RACE_MENU: &[Entry] = &[
    command(
        "restart",
        "Restart Stage",
        Some("CmdOrCtrl+R"),
        Target::Page("restart"),
    ),
    command("pause", "Pause", None, Target::Page("pause")),
    Entry::Separator,
    command(
        "menu",
        "Main Menu",
        Some("Shift+CmdOrCtrl+M"),
        Target::Page("menu"),
    ),
    Entry::Separator,
    command(
        "photo",
        "Take Photo",
        Some("Shift+CmdOrCtrl+P"),
        Target::Page("photo"),
    ),
    command(
        "gallery",
        "Photo Gallery",
        Some("Shift+CmdOrCtrl+G"),
        Target::Page("gallery"),
    ),
    Entry::Separator,
    Entry::Native(Native::CloseWindow),
];

/// NOT decoration, and the one menu whose absence is a BUG: the high-score
/// board asks the player to type a name, and without these rows ⌘C and ⌘V do
/// nothing in that field. The responder chain serves them; a webview cannot.
const EDIT_MENU: &[Entry] = &[
    Entry::Native(Native::Undo),
    Entry::Native(Native::Redo),
    Entry::Separator,
    Entry::Native(Native::Cut),
    Entry::Native(Native::Copy),
    Entry::Native(Native::Paste),
    Entry::Native(Native::SelectAll),
];

const VIEW_MENU: &[Entry] = &[command(
    "fullscreen",
    "Enter Full Screen",
    Some("Ctrl+Cmd+F"),
    Target::Fullscreen,
)];

const WINDOW_MENU: &[Entry] = &[
    Entry::Native(Native::Minimize),
    Entry::Native(Native::Maximize),
    Entry::Separator,
    Entry::Native(Native::CloseWindow),
];

/// Where a player in trouble is sent. Apple asks a store listing for a support
/// page and a privacy page; the same two pages belong in the app, where
/// somebody is actually stuck. All three open in the BROWSER — the window is
/// pinned to its own origin and a game is not a place to read a policy.
const HELP_MENU: &[Entry] = &[
    command(
        "controls",
        "Keyboard Controls",
        None,
        Target::Page("controls"),
    ),
    Entry::Separator,
    command("site", "Website", None, Target::Link("/")),
    command("privacy", "Privacy Policy", None, Target::Link("/privacy/")),
    command("support", "Support", None, Target::Link("/support/")),
];

/// The whole bar, in the order macOS draws it. The first menu takes the app's
/// name whatever it is called here, which is why its title is the app's.
pub fn menu_bar() -> &'static [Menu] {
    &[
        Menu {
            title: WINDOW_TITLE,
            entries: APP_MENU,
        },
        Menu {
            title: "Race",
            entries: RACE_MENU,
        },
        Menu {
            title: "Edit",
            entries: EDIT_MENU,
        },
        Menu {
            title: "View",
            entries: VIEW_MENU,
        },
        Menu {
            title: "Window",
            entries: WINDOW_MENU,
        },
        Menu {
            title: "Help",
            entries: HELP_MENU,
        },
    ]
}

/// Every row this crate serves, flattened — what a menu event is looked up in.
pub fn commands() -> Vec<Command> {
    menu_bar()
        .iter()
        .flat_map(|menu| menu.entries.iter())
        .filter_map(|entry| match entry {
            Entry::Command(command) => Some(*command),
            _ => None,
        })
        .collect()
}

/// What a menu event with this id should do, or `None` for an id from a menu
/// this app did not build.
pub fn target_of(id: &str) -> Option<Target> {
    commands()
        .into_iter()
        .find(|command| command.id == id)
        .map(|command| command.target)
}
