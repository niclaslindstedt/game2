---
title: The corridor readers take a signed lateral, and passing them a distance silently mirrors the bank
date: 2026-08-27
scope: engine/mapgen/terrain.ts, engine/mapgen/road.ts, engine/game/track.ts
concepts: [road, terrain, bank, ground-follow, cross-section]
---

`corridorOffset(shape, lateral, width)` is signed: everything in the
cross-section is symmetric in `|lateral|` EXCEPT R19's bank, which is
`-bank * lateral`. `terrain.ts` called it through `ribbonY` with `near.d` —
the unsigned distance from `nearestSample` — so the ground beside a banked
corner was tilted the same way on both sides. The renderer draws the ribbon
from the signed lateral, so on one side of every banked corner the physics
ground sat up to a metre away from the drawn one: measured ±1.06 m on seed 3,
which is a car sliding under the verge.

Two habits that catch this class of bug:

- `nearestSample` returns `lateral` alongside `d`. Use
  `sideOf(lateral) * Math.min(d, cap)` rather than `d` — and `sideOf` must
  never return 0, because `Math.sign(0)` collapses the offset along with the
  sign.
- Probe it rather than reading it: walk a compiled stage's banked samples and
  diff `terrain.groundAt(x, z)` against
  `s.elevation + corridorOffset(s, lateral, width)`. A mismatch that FLIPS
  SIGN with the side is this bug; one that does not is geometry.

`tests/roads_test.ts` now holds the regression under "one ground under the car
and the picture of it".
