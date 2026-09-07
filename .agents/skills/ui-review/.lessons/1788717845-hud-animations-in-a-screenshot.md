---
title: A HUD element with an entrance animation is INVISIBLE in an in-game screenshot unless the layer freezes it — the picture is painted at time zero
date: 2026-09-06
scope: pwa/src/styles.css, pwa/src/game/shot-hud.ts
concepts: [css, hud, screenshots, animation, verification]
---

The player's screenshot rasterizes the DOM chrome through an SVG
`<foreignObject>` (`shot-hud.ts`), and **an SVG image is painted at time
zero**: every CSS animation in it starts over from its first keyframe. The
HUD's entrances all begin at `opacity: 0` (`hud-flash-pop`, `hud-split-in`,
`hud-anchor-in`, `hud-mirror-say`), so the news column, the split board, the
mirror label and the touch wheel were all on screen and absent from every
picture — with the signature stamp then dropped on top of them, because the
cover map read that corner as empty.

`shot-hud.ts` now stills the whole layer (`LAYER_STILL_CSS`) and inlines
where each running animation or transition had actually got to. Two things
that fix does NOT reach, so keep them in mind when writing HUD CSS:

- **A `::before`/`::after` animation** has no node to inline a value onto; it
  renders at its resting style. Do not put an element's only visible state
  behind a pseudo-element's animation.
- **`backdrop-filter`** has nothing behind it inside the image, and
  `env(safe-area-inset-*)` is zero in there.

The general rule: an instrument's RESTING style must be the one that reads.
An animation may add emphasis; it must not be what makes the thing visible.
