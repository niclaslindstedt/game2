---
title: The tree's snap was calibrated against a constant bounce — `(1 + e)` hides in `delivered`, so a restitution law moves what breaks
date: 2026-09-05
scope: engine/game/collision.ts, engine/mapgen/solids.ts
concepts: [collision, solids, trees, restitution, tuning]
---

`meetSolid` decides whether a trunk stands by the impulse the car delivers,
`(1 + e) × closing × mass`. While `e` was a constant 0.3 that was a third
more than a folding car actually hands over, and `SNAP_PER_MASS.wood` (30)
had absorbed it: the biggest spruce was "a wall until 120 km/h" against
`1.3 × m × v`. Making `e` fall with the closing speed (`restitutionAt`)
put the old tree's 140 km/h break under its snap and the test went red.

The recalibration is one number: wood 30 -> 24, which is `1.05 / 1.3` of it,
and the speeds in the comment did not move. The general shape: any threshold
compared against an impulse that carries `(1 + e)` was tuned to the `e` of
its day, and a restitution change owes a pass over every one of them —
`meetSolid`'s snap and anchor, and nothing else in this module, since the
kerb's bite and the trip are priced off the closing speed itself.

Two more things the same change moved: `collideCar` now leaves a car AT the
wall it hit rather than 15 m back up the road, so a test that drives on
afterwards meets different scenery — the one-wheel test drove blind into a
rock at 40 km/h and retired for its engine, and the fix was to stub
`obstaclesNear`/`treesNear` for the drive-on, as every crash test does.
And `jump_test`'s strip entry had to be re-picked per its own instruction
(-22 -> -24) once the roof folded by half and the ground gave.
