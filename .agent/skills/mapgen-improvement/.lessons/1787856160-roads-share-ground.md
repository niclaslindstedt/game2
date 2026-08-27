---
title: The terrain lays its shelf under ONE road — every keep-out rule exists to stop a second one floating
date: 2026-08-27
scope: engine/mapgen/
concepts: [self-distance, spurs, terrain, road-network, plausibility]
---

`createTerrain` shapes the ground from the NEAREST road (`nearestSample`, plus
`spurs.nearest`). Where two corridors overlap it can only serve one, so the
other's drawn ribbon hangs in the air with nothing under it and nothing solid
to drive on — a wall of road the player sees through and drives through. Three
places let that happen at once, and each needed its own fix:

- **R10's distance was a fixed 30 m while the road WIDTH is a dial** (9–22 m).
  Two corridors are `width + 2 · ROAD_CROSS.reach` wide together — 29 m at the
  default and 35 m at the top of the dial, so the widest stages laid their own
  mats over each other legally. Any distance rule between roads has to be
  computed from the width (`roadClearance` in `road.ts`), never authored flat.
- **Branches (R17) had no keep-out at all** — measure before you assume:
  a probe over 120 stages found 335 spur-vs-route approaches under 30 m, one
  of them a branch 27 m ABOVE the stage.
- **The 30 m apron past each stage end is road** (drawn, shelved, ridden) and
  lives in no sample array, so nothing checked it. It has to be stated as
  geometry — the capsule behind `samples[0]` — wherever roads are kept apart.

How far to push the clearance is a MEASURED call, not a taste one: the margin
above the two corridors trades directly against the stage vocabulary's tightest
folds, because a hairpin's two arms are legitimately a road's width apart.
Measure the turn-severity mix (soft/medium/hard share over ~160 stages) before
and after; at margin 26 m the hard share fell 12.6% → 10.6%, at 13 m it held at
12.1%. The `make sim` table over 8 seeds is too noisy to see this — run
`--count 30` before believing a drift-time move.
