---
title: Where two roads overlap, fix the draw order and the depth bias before believing anything you see
date: 2026-08-27
scope: pwa/src/game/world.ts, scripts/lib/stage-render.mjs
concepts: [junctions, rendering, preview, review]
---

Two road ribbons that cover the same ground — a branch and the stage road
at a junction — produce two artifacts that look like generator bugs and are
not:

- **Coplanar mats tear.** Once both are warped onto one junction plane they
  sit at the same height and z-fight into a mottled band. Give the branch's
  ribbon a slightly smaller vertical bias than the stage's.
- **Two sets of wheel tracks crossing** reads as two ribbons laid over one
  another, because it is. Flatten the wear toward a constant inside the
  junction; a real crossing is scuffed evenly all over anyway.

And in the top-down preview, DRAW ORDER is a correctness property: the
branch's cones and tape were painted before `drawRoad(track.samples)` and
the stage road covered them, so a junction looked unmarked. Anything that
sits ON the road — closures, gore paving, markers — goes after every road
is drawn.

One more, from the same pass: a paint effect keyed on a whole-platform
field (`flat`) smears over its entire reach. The gravel drag-out keyed that
way turned sixty meters of tarmac tan. Key mouth-local effects on distance
from the junction POINT, not on the platform's own falloff.
