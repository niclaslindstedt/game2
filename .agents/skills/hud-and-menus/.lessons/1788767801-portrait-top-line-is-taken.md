---
title: In portrait the top line of the frame is already taken — the first row clear all the way across is `--hud-health-top`
date: 2026-09-07
scope: pwa/src/styles.css
concepts: [hud, css, layout, portrait, screenshots]
---

Landscape leaves a wide free strip along the top edge between the clock
(`.hud-top`, top left) and the minimap dock (top right), so a centred banner
can sit at `max(0.6rem, env(safe-area-inset-top))` and clear both. Held
upright that strip does not exist: the clock takes the left of that line, the
dock the right, and a centred element between them is pinched to nothing.

The first row where the frame IS clear across is the foot of the dock — the
condition schematic's own top, now `--hud-health-top` on `.hud`. Anything
centred that has to clear the corners in portrait should drop to that
variable rather than invent a percentage; a percentage clears the dock on a
tall phone and slides under it on a short one, which is the same complaint
`--split-top` already answers the same way.

The matching trap on the other side: `--pace-top` (the co-driver's slot,
worn by `.hud-pace`) is NOT the top of the frame. It hangs a band or two
down — under the mirror and under the split — which on a stage is where the
road ahead is. Borrowing `.hud-pace` for its column shape (full width,
centred, `pointer-events: none`) is fine and cheap; inheriting its `top` puts
the element over the road. Override `top` and keep the rest.

Both orientations need their own photograph, and `scripts/screenshot.mjs`
takes bare-word scene filters (`node scripts/screenshot.mjs spectate`) so
re-shooting one surface in both is seconds, not a full run.
