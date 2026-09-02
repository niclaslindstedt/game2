---
title: A world bug reported as "the level generator" is usually the QUERY over the stage, not the stage
date: 2026-09-01
scope: engine/game/track.ts, engine/mapgen/terrain.ts, pwa/src/game/
concepts: [bug-classification, mapgen, terrain, locate, renderer, probes]
---

A report like "driving up the mountain throws me 50 m in the air and the
rocks lie in midair — something is wrong with the level generator" was three
separate bugs and NONE of them was in `engine/mapgen`'s rules or search. The
stage was fine; what was wrong was the code that ASKS the stage questions.

Two probes settle it in minutes, before reading any generator code:

- **`locate` against brute force.** Compile the reported stage, then for a
  spread of points call `locate(track, x, z, hint)` with several different
  hints and compare the index and `elevation` against a whole-road nearest
  scan. If the answer moves with the hint, the teleport is the query. Level 1
  had 18,583 on-road positions handed a height belonging to somewhere else,
  the worst 32 m out.
- **`heightAt` against `latticeAt`.** Anything the renderer STANDS on the
  ground has to be planted on the drawn surface. Sample both fields over a
  band either side of the road: they agree only at the 14 m lattice corners,
  and beside level 1's roads the gap ran to 9 m with 15% of the ground over
  half a metre. That gap IS the floating boulders.

Both probes are ten lines each against `@engine` and are worth writing before
`make analyze` or `make track`, because the generator's own scoreboard cannot
see either failure — it scores the stage, and the stage was never wrong.
