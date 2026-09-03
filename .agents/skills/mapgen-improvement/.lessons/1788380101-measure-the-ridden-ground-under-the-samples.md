---
title: Roll the ridden ground at a stride UNDER the sample spacing — a nearest-vertex shelf is a staircase that reads as a clean grade at the samples' own stride
date: 2026-09-02
scope: engine/analysis/lanes.ts, engine/mapgen/spurs.ts, engine/mapgen/terrain.ts
concepts: [analysis, measurement, spurs, sampling, terrain, staircase]
---

Every road off the stage — branch, drive, car park lane — was a staircase: the
spur index handed the terrain the nearest SAMPLE, so the shelf held one
sample's height for four metres and stepped 0.3 m at each, with the crown
wandering as the nearest vertex changed hands. Nothing reported it because the
only instrument was `rollers`, which visits the ROUTE, and a probe at the
samples' own 4 m stride reads a staircase as an 8% ramp.

Two rules from it:

- **A lookup that hands back a vertex is not a road.** `SpurIndex.nearest`
  now projects onto the segment and returns an interpolated scratch sample
  (read it before the next query, never keep it). Anything else that stands
  a surface off "the nearest sample" has the same bug until it interpolates.
- **Stride under the spacing.** `lanes` rolls three balls at 1 m
  (`ANALYSIS.lanes.stride`) and runs `past` metres beyond both ends onto
  whatever the road meets, so the join and the pad's rim are measured as
  road. Measured at 1 m the healthy population bumps under 0.03 m; the joins
  reach 0.25.

The new instrument then found its siblings in one sweep — drives dropped onto
their yards, lanes arriving 13 m over the arm they joined, a drive's mouth
stepping where the stage's verge hand-over sagged under its mat, a guard
grove's sapling on a yard whose rim only the patch centre had cleared. Expect
a new metric to open a queue; fix the worst and keep the exit code honest.
