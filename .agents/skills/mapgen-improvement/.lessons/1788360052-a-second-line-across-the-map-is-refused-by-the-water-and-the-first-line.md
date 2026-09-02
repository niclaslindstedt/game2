---
title: A second line laid edge to edge across the map is refused by the WATER first and by the first line second — tune the dodge radius and aim it from the road's own side before touching its chance
date: 2026-09-02
scope: engine/mapgen/highway.ts
concepts: [road-network, railway, water, search, placement, measurement]
---

`layRailways` at a main line's numbers (560 m radius, 260 m dodge) came out
on 6 seeds in 48 with `rail.chance` at 0.75. Tallying `layOne`'s four
`return null`s over the sweep (a `process.env` probe, restored afterwards):
823 water, 60 out, 45 keep, 35 start. The chance was never the limit.

Two levers, both in `RAILWAY`, neither in the dice:

- The water dodge. `avoidRadius` is the curve the walk may take round a
  lake it can already see; at 260 m it cannot turn away in time and the
  line is vetoed by `land.nearWater`. 130 m gave 19 lines, 95 m gave 24 —
  a branch line's curve, and half the seeds have a railway.
- The other line. Two lines laid rim to rim across one map cross each
  other unless they set out from the same side, and R23's `keep` refuses
  the crossing. `aim` enters the second line within `spread` of the first's
  entry bearing (0.55 rad — wide enough that they are never parallel), and
  `keep` fell from a third of the refusals to a tenth.

Read the result off the whole sweep (`lines N/48`), and only then decide
whether the chance needs moving at all.
