---
title: Sample spacing is only APPROXIMATELY SAMPLE_STEP, so `s / track.step` misses by metres on a long stage
date: 2026-08-27
scope: engine/mapgen/compile.ts, engine/mapgen/
concepts: [samples, geometry, arc-length]
---

`compileTrack` divides each SEGMENT into a whole number of steps
(`built.length / steps`), so the real spacing is per-segment and near — but
never equal to — `SAMPLE_STEP`. The slack accumulates along the stage.

Anything that needs the sample AT a given arc position must SEARCH the
samples (they are monotonic in `s`, so binary search), not compute
`Math.round(s / track.step)`. Placing the finish gate that way put it four
metres off the line the clock actually stops at on a 1.9 km stage, and the
error grows with stage length. `finishIndex` in `compile.ts` is the worked
example.

The existing `elevationAt` and the guard/stand `sampleAt` helpers use the
division form deliberately — they only want "a sample near here" and the
metre or two costs them nothing. Use the search whenever the answer has to
line up with something the player sees or the physics tests.
