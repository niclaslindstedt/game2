---
title: A range input is hit-tested on its BOX, so a fader styled to the height of its line is a fader you have to catch by the dot
date: 2026-09-09
scope: pwa/src/styles.css, pwa/src/game/menu-knobs.tsx
concepts: [menus, css, input, touch, ui, hud]
---

`.knob-range` was `height: 0.5rem` with the filled track painted straight onto
the input's own `background`. It looks right and it reads right, and it gives
the control an **8 px** target in a **45 px** row: a press three pixels above
the line lands on nothing. The thumb overhangs the box and still takes a
press, so what a player learns is that the fader has to be CAUGHT by its dot
before it can be set — which is not a fader, it is a drag handle.

The horizontal half was never the problem: every browser already puts the
thumb where the track was pressed and carries straight on into the drag. Only
the vertical band was missing.

The fix is to size the ELEMENT to the press and draw the line INSIDE it:

- `height: 1.5rem; background: none` on the input;
- the fill gradient moves to `::-webkit-slider-runnable-track` and
  `::-moz-range-track` (a custom property like `--fill` set inline on the
  input inherits into both);
- webkit then hangs the thumb off the TRACK's top edge where it used to centre
  it on the element, so it needs `margin-top: calc((track - thumb) / 2)`,
  border included — nothing here is `border-box`. Firefox centres it for you.

Two things worth knowing before picking the height:

- **Pick it under the SHORTEST row's content box** and no layout moves at all.
  1.5rem clears the pause card's `min-height: 2.1rem` in landscape, and the
  options row measured 45.5625 px before and after.
- **A taller band does not eat a scrolling card's swipe.** Verified with real
  touch events on the landscape options page, which scrolls: a vertical drag
  starting on the band scrolled the card (`scrollTop` 0 → 81) and left the
  value alone, while a tap 2 px inside the band's top edge set it.

A screenshot cannot show a hit box: drive the built app, read the input's
rect against its row's, and press at each height the row has to give.
