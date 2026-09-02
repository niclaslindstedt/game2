---
title: Water at a crossing is ONE level — the valley's, read across the road as well as along it — held for a reach either side, with no sway across the mat
date: 2026-09-02
scope: engine/mapgen/river.ts, engine/mapgen/terrain.ts, engine/mapgen/generate.ts
concepts: [water, rivers, fords, culverts, plausibility, valleys]
---

The ford's water used to be set off the ROAD's own line at the crossing
(`base + low`), so a road on a fill crossed a pool a metre above the river
beside it — water standing on the mat, the river below it, no drainage.
Three rules fix it and each one was needed:

- The level is the VALLEY's: `valleyUnder` reads the bare land at the
  crossing's middle AND across the road (the lower side's probes at 14 and
  28 m), and the ford dips to `min(road wanted, valley) - bedDepth`. A road
  too high to dip (`drop > water.culvert.fordDrop`) gets a culvert instead:
  the road stays on its fill, the water goes through it at the valley.
- The pool is HELD at that level for `POOL_REACH` (28 m) on both sides of
  the road — the leg arriving at a crossing descends to it over its last
  window, the source and mouth walks hold it before climbing or falling.
  Without the hold the river's own grade put a step at the road's edge.
- The course does not SWAY in the crossing window (`push(..., steady)`):
  the sinuosity that reads as a river in the open reads as the water
  wandering onto the apron beside the mat, which `rollers.dry` reports.

`make analyze` names all three failure modes: water.road (on the mat),
water.float (a sheet over air beside the fill), rollers.dry (a wet apron).
