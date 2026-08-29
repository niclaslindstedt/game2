---
title: A menu's SENTENCES are its height — cut them to glyphs, and keep the explanations only where a setting is being made
date: 2026-08-29
scope: pwa/src/game/main-menu.tsx, pwa/src/game/menu-levels.tsx, pwa/src/game/menu-glyphs.tsx
concepts: [menus, ui, glyphs, portrait, landscape]
---

When a menu card will not fit, the padding is not the problem. On the front
door six rows each carried a sentence saying what the mode was; on a stage
grid every box carried the stage's blurb and every LOCKED box repeated the
same unlock reason. Replacing those with a mark from `menu-glyphs.tsx` took
the root card from 563px to 326px on a 390-wide phone (and stopped it
scrolling on a 1280x720 laptop), and the stage box from 7.5rem to 5.4rem —
which is what finally put a location's six stages on a phone held sideways.
Nothing else on those cards moved.

Two rules that came out of it:

- **Text that repeats per row is the first cut.** A reason printed on five
  padlocks is one reason, and it belongs in the box's `title`/`aria-label`
  where a reader that cannot see a padlock still gets it.
- **A settings page is the exception.** OPTIONS' toggle hints say what the
  setting BUYS, which is the whole point of the page and not discoverable by
  pressing it; that page may honestly scroll. What comes off there is only
  what the shape cannot hold — the loose `.opt-toggle` hint on a MODE page,
  under `@media (orientation: landscape) and (max-height: 34rem)`.

Meaning shared across surfaces is what makes a glyph cheap: the trophy is the
campaign AND a stage's best finish, the stopwatch is the time trial AND a lap
record, so a player learns each mark once. Judge them at 14px with
`make glyphs` before wiring any of it up — two cars seen from above read as a
pair of pills at that size, and a compass reads as a circle with a slash.
