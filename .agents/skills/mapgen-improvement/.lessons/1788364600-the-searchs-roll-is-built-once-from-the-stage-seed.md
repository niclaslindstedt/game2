---
title: Anything the search PLANS in height reads the roll the compiler will draw — build it once from the stage seed, never per attempt
date: 2026-09-02
scope: engine/mapgen/generate.ts, engine/mapgen/rolling.ts, engine/mapgen/compile.ts
concepts: [search, elevation, rolling, fords, determinism, seeds]
---

The R34 roll is a seeded noise the compiler adds to the road's base. The
moment the search plans anything that depends on the road's height — a
ford's aprons sized to the drop, a jump's landing, the R23 height clause —
it has to read THE SAME roll, and the trap is the retry loop: `tryGenerateStage`
runs under a sub-seed per attempt, and a roll built inside it from that
sub-seed is a different wave from the one `compileTrack` draws from the
stage's seed. Every apron the search sized then landed a metre off the dip
the compiler cut, and the analyzer read it as roads.step and water.road
errors that no rule explained. `buildRolling(seed, dials)` is built once in
`generateStage` and passed into every attempt; the walk carries `rollS`
(the distance the roll is read at) in its profile and rewinds it with the
rest of the cursor on a backtrack.
