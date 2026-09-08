---
title: A default that lives only in the comment above it — the whole set shot with no field in it
date: 2026-09-08
scope: scripts/store-shots/recipes.mjs
concepts: [recipes, headsup, defaults, verification]
---

`mode: "headsup"` was written into the comment documenting `SHOT_DEFAULTS`
and never into the object. Every frame in the set was therefore shot on the
campaign's STAGGER, where each crew drives its own stage on its own clock and
is never physically near the player — so the harness produced six genuinely
beautiful photographs of an EMPTY ROAD, one of them captioned GET PAST THEM,
with POSITION 15/15 in the corner and a single marker on the minimap.

Two lessons, and the second is the expensive one.

**The frame is the only test of a recipe.** Nothing else caught this: lint was
clean, the typechecker was clean, the harness reported `2 captured, 0 failed`,
and the PNGs were the right raster. Never report a set as working from the
capture log — open the pictures.

**A test that checks "nothing overrides the default" does not check the
default.** The case asserting `shot.params.mode === undefined` for every recipe
passed happily through the broken run. It now asserts
`SHOT_DEFAULTS.mode === "headsup"` first. When a rule lives in a shared
default, assert the DEFAULT; the per-row check is the second half of the pair,
not the whole of it.

The tell in the picture, for next time: **POSITION 15/15 with nothing on the
minimap but your own marker.** The position readout is filled in from the
field's size whether or not the field is on the road with you, so it says
15/15 either way — the minimap is what distinguishes the two.
