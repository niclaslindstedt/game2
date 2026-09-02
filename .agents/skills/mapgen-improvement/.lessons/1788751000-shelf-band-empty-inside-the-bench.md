---
title: The stage's shelfBand is DEGENERATE inside its own bench — a road leaving the stage must not consult it until it is past the bench
date: 2026-09-01
scope: engine/mapgen/spurs.ts, engine/mapgen/homesteads.ts, engine/mapgen/compile.ts
concepts: [shelf-band, r31, spurs, homesteads, placement]
---

`shelfBand(x, z)` (compile.ts) folds every route sample within reach into
one ceiling and one floor, and inside the bench (`verge.bench` + the
strided walk's slack, ~28 m of the centerline) the swing is zero — so a
road on any grade puts the floor of one sample over the ceiling of the
next, and the band comes back EMPTY at every point beside the road. That is
not a verdict that no road can stand there: the cone simply has nothing to
say inside the bench, where the ground IS the stage's cross-section.

Two wrong answers, both tried on the homestead drives:

- **Rejecting on an empty band** placed nothing: every one of 106
  candidates on a 24-seed sweep died at its first step.
- **Clamping to the ceiling** (what `buildSpur` does, and gets away with
  because a branch's first stretch is warped onto a junction platform)
  snapped the drive three quarters of a metre down one step past the lip,
  onto the lowest nearby crown. `make analyze` reported it as
  `rollers.cross` — "a step across the rank beside it" — which is how it was
  found; it is invisible in a top-down preview.

The right answer: lay the new road ON the stage's cross-section while it is
inside the lip (`corridorOffset(sample, side * s, sample.width)`), follow
the country from there, and only start clamping to the band once `s` is
past the bench plus slack, where the band has a real width.
