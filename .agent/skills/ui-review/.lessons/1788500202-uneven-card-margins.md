---
title: "Uneven card margins" is usually two other bugs — a scrolling card losing its end padding, and a head row taller than the button inside it
date: 2026-08-30
scope: pwa/src/styles.css
concepts: css, layout, menu-card, safe-area, phone
---

A report that a card has more air above its first row than under its last is
almost never the padding, which is symmetric. Measure the screenshot rather
than the stylesheet — decode the PNG and read the pixel rows where the
border, the first chip and the last button start — and two causes come up:

**The card is OVERFLOWING by a couple of pixels.** `.menu-card` is
`max-height: 100%` with `overflow-y: auto`, and a scroll container that
overflows does not paint its bottom padding in every engine. On an iPhone
the pre-race card came out 2.6 px too tall for a 393 px landscape screen
(the home indicator's `env(safe-area-inset-bottom)` is ~21 px of it) and the
8.6 px of bottom padding rendered as 6. The fix is to make the content fit,
not to add padding; the headless viewport has no safe-area insets, so a card
that fits at 844×390 in Chromium can still overflow on the real phone —
budget the insets by hand.

**The head row is taller than the button in it.** `.menu-head` centres
`.menu-back` against title + subtitle, so on a card with a subtitle the
button sits ~10 px below the padding while the button under the card sits
exactly on it. `align-self: flex-start` on `.menu-head .menu-back` puts the
two on the same measure, and changes nothing on a head with no subtitle,
where the button is already the taller of the two.

The measuring script is worth writing before the fix: serve `pwa/dist`,
click through to the card at each viewport, and print
`getBoundingClientRect()` for the card, its padding, the head, the back
button and the last row. It turns "looks off" into two numbers to make
equal.
