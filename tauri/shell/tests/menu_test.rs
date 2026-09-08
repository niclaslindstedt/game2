// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE MENU BAR'S RULES.
//!
//! A menu is easy to get subtly wrong in ways nothing catches until a Mac is
//! in front of you: two rows sharing an accelerator (one of them silently
//! never fires), a binding that takes a key the CAR needs, a row pointing at a
//! page command the game does not answer. All three are decidable from the
//! table alone, so all three are decided here.

use scanflick_shell::config::{site_link, SITE_URL, WINDOW_TITLE};
use scanflick_shell::menu::{commands, menu_bar, target_of, Entry, Target};

#[test]
fn the_first_menu_is_the_app_and_the_second_is_the_race() {
    let bar = menu_bar();
    // macOS puts the application's own name first whatever the table says;
    // saying it here keeps the bar readable in this file too.
    assert_eq!(bar[0].title, WINDOW_TITLE);
    // NOT "File". There are no files — see the module header.
    assert_eq!(bar[1].title, "Race");
    let titles: Vec<&str> = bar.iter().map(|menu| menu.title).collect();
    assert!(!titles.contains(&"File"));
    // Edit is not optional: without it the responder chain never offers
    // Cut/Copy/Paste, and the high-score board asks the player to TYPE.
    assert!(titles.contains(&"Edit"));
    assert!(titles.contains(&"Help"));
}

#[test]
fn every_row_has_its_own_id() {
    let mut ids: Vec<&str> = commands().iter().map(|command| command.id).collect();
    ids.sort_unstable();
    let count = ids.len();
    ids.dedup();
    assert_eq!(ids.len(), count, "two menu rows share an id");
}

#[test]
fn no_two_rows_claim_the_same_accelerator() {
    let mut keys: Vec<&str> = commands()
        .iter()
        .filter_map(|command| command.accelerator)
        .collect();
    keys.sort_unstable();
    let count = keys.len();
    keys.dedup();
    assert_eq!(keys.len(), count, "two menu rows share an accelerator");
}

/// THE ONE THAT WOULD COST A KEY. A menu accelerator is served by the system
/// BEFORE the page sees the event, so a row bound to a bare key takes that key
/// away from the car for the life of the window — silently, and only on macOS.
/// Every binding therefore carries a modifier.
#[test]
fn no_row_takes_a_key_off_the_car() {
    for command in commands() {
        let Some(key) = command.accelerator else {
            continue;
        };
        assert!(
            key.contains('+'),
            "{} is bound to the bare key {key}, which the game would never see again",
            command.id
        );
        assert!(
            key.contains("Cmd") || key.contains("CmdOrCtrl"),
            "{} ({key}) does not carry a command key",
            command.id
        );
    }
}

/// Every word the bar sends the page, so `tests/tauri_test.ts` can hold this
/// list against `pwa/src/shell-host.ts`'s. Kept as an assertion rather than
/// only over there because a word added here with no listener on the other
/// side is a menu row that does nothing.
#[test]
fn the_page_commands_are_the_ones_the_game_answers() {
    let mut sent: Vec<&str> = commands()
        .iter()
        .filter_map(|command| match command.target {
            Target::Page(word) => Some(word),
            _ => None,
        })
        .collect();
    sent.sort_unstable();
    assert_eq!(
        sent,
        ["controls", "gallery", "menu", "pause", "photo", "restart", "settings"]
    );
}

#[test]
fn help_opens_the_website_and_never_this_window() {
    for command in commands() {
        let Target::Link(path) = command.target else {
            continue;
        };
        assert!(path.starts_with('/'), "{} is not a rooted path", command.id);
        assert!(site_link(path).starts_with(SITE_URL));
    }
    // The two pages the store listing names are reachable from inside the app
    // as well, which is where a stuck player actually is.
    assert_eq!(target_of("privacy"), Some(Target::Link("/privacy/")));
    assert_eq!(target_of("support"), Some(Target::Link("/support/")));
    assert_eq!(site_link("/privacy/"), format!("{SITE_URL}/privacy/"));
}

#[test]
fn an_id_from_somebody_elses_menu_is_not_guessed_at() {
    assert_eq!(target_of("no-such-row"), None);
}

#[test]
fn no_menu_is_empty_and_none_begins_or_ends_on_a_separator() {
    for menu in menu_bar() {
        let entries = menu.entries;
        assert!(!entries.is_empty(), "{} has no rows", menu.title);
        assert_ne!(
            entries.first(),
            Some(&Entry::Separator),
            "{} opens on a separator",
            menu.title
        );
        assert_ne!(
            entries.last(),
            Some(&Entry::Separator),
            "{} ends on a separator",
            menu.title
        );
    }
}
