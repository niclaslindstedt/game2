---
title: A prop stands on the RIDDEN ground and the eye sees the LATTICE — and a verdict about the seed belongs at cell-build time, not in `standing`
date: 2026-09-11
scope: engine/mapgen/props.ts, engine/mapgen/terrain-ground.ts
concepts: [snow, winter, props, solids, performance, terrain]
---

Two traps, one afternoon, both in `props.ts`'s snow burial rule (R47).

**The surfaces are not the same one.** `addSolid` plants a prop's foot on
`groundAt`, which off-road is the bare lattice plus `CLIMATE.blanket.ride`
(0.6) of the blanket — the floor the WHEELS ride. What the player looks at
is `latticeAt`, the bare lattice plus the WHOLE blanket. So a solid's height
is not how much of it stands out of the snow: that is
`ob.y + ob.height - latticeAt(...)`, and the difference is `0.4 × blanket`,
a good half metre on a winter stage. A burial rule written against
`ob.height` alone leaves stones poking a hand's breadth out of a drift —
below `TUNING.collision.solids.tripTop`, so they roll the car rather than
stop it, and white on white nobody sees them coming. Any new rule about what
stands in snow wants `latticeAt`, and the prop field has to be handed it.

**And it costs a microsecond a query if you put it in the wrong place.**
`standing()` is called for every candidate of every gather, thousands of
times a step, and `obstaclesNear` is on the physics' own per-step path with
a 12 µs budget the analyzer checks (`perf.query`). Reading two heightfields
there took a winter stage from 1.44 to 2.60 µs a call. But where a solid
stands and how deep the snow over it lies are both facts about the SEED —
only `felled` changes during a run — so the verdict belongs where each cell
is BUILT and cached (every `xCache.set`), which took it to 1.18 µs, under
the old number because fewer props come back. Before adding anything to
`standing`, ask whether the answer can change mid-run.
