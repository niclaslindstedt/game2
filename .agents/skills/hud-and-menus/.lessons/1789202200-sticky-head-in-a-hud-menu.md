---
title: A pinned head inside `.hud-menu` must be OPAQUE and must eat the card's 1.2rem top padding — sticky alone leaves the title ghosting and a sliver above the band
date: 2026-09-07
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css, menus, hud, scrolling, layout]
---

`.hud-menu` is a scroll container (`max-height: 100%; overflow-y: auto`),
so a header row put at the top of one scrolls away with the body — which on
a card carrying a graph and a settings strip means the way OUT scrolls off
screen. `position: sticky; top: 0` is the fix, and on its own it is wrong
twice:

- **The card is translucent, so the band must not be.** `.hud-menu` is
  `rgb(18 48 105 / 82%)` over a rally at speed. A band in the same colour at
  the same alpha lets the title and the score read through it as they pass
  beneath — faint enough to look like a rendering fault, clear enough to
  notice. The band gives up the card's translucency and takes the colour at
  full opacity; a `border-bottom` under it says that is deliberate rather
  than accidental.
- **Sticky pins to the scrollport, which is INSIDE the card's padding.**
  `.hud-menu` has `padding: 1.2rem …`, so a band at `top: 0` stops 1.2rem
  below the card's own top edge, and content scrolls up through that strip
  and is guillotined by the card's border. Pull the band over it and give the
  padding back inside:

  ```css
  margin-top: -1.2rem;
  padding-block: 1.2rem 0.35rem;
  ```

Horizontally nothing is needed: the band and the content share the card's
content box, so nothing can appear beside it.

`.bench-head` is the shipped example. Judge it SCROLLED — at rest every
version of this looks correct.
