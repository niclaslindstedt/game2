---
title: A HUD glyph that gets scaled down and dimmed needs an AREA, not just strokes — the pace strip's second slot is where thin-line icons die
date: 2026-09-08
scope: pwa/src/game/hud-pace.tsx, pwa/src/styles.css
concepts: [hud, review, screenshots, ui]
---

`.hud-pace-next` — the co-driver strip's second call — is drawn at
`scale(0.58)` and `opacity: 0.5`. Those multiply: a stroke tuned to read at
full size is under two thirds as wide and half as present, over a background
that on a bright sky is barely darker than the ink.

A one-stroke glyph survives it (a corner sign is a single fat line, and the
plate's solid colour wedge carries the direction anyway). A glyph made of two
or more thin lines does not — the jump sign is a road, an arc and the daylight
between them, and all three shrink together into nothing.

Two fixes, and it took both:

- **Put the ink back in proportion to what the scale takes out.** A
  `--pace-stroke` override under `.hud-pace-next` costs nothing and is exactly
  the compensation the transform asks for. Lengthen any `stroke-dasharray`
  with it, or the broken line closes up into a solid one.
- **Give the glyph a filled REGION, not only lines.** The old jump icon read
  at small size because of one solid `<polygon>` arrowhead. Replacing it with
  strokes lost that, and the honest replacement was to wash the area the glyph
  is actually about — here the air between the flight and the ground. An area
  survives scaling and dimming where a hairline does not, and it usually
  carries the quantity too (more air = a bigger jump), so it is not decoration.

Judge it by clipping the plate out of a real frame at both slots, not by
looking at the sign at full size — the first-slot version looked finished
while the second-slot one was invisible.
