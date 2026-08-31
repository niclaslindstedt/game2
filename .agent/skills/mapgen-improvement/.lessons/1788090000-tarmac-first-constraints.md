---
title: "Laying the tarmac before the route: what the engine will and will not let you do"
date: 2026-08-30
scope: engine/mapgen/highway.ts, engine/mapgen/borrow.ts, engine/mapgen/generate.ts
concepts: [junctions, asphalt, road-network, search, elevation, architecture]
---

R17 lays the public roads before the route (`highway.ts`) and the route borrows
one (`borrow.ts`). Three constraints decide how much of that model the engine
can actually take, and each one costs a rebuild to discover.

**Height cannot be laid first.** The stage's elevation is a profile along the
ROUTE's arc (`rolling(rollS)`), not a heightfield, so a road laid on the bare
land disagrees with the route the instant the two share ground. A network laid
up front can only say WHERE the tarmac goes; how high it is stays the
compiler's, settled from the junction outward.

**An approach that lines up parallel can never join.** The corner onto a road
covers `radius · (1 − cos turn)` of sideways ground, so a route that closes its
heading error to zero — the way anything follows a line — needs an infinite
radius to get on, and every join is refused however close it gets. Hold a
crossing angle (~50°) right up to the kerb instead: the solvable band is
`|off| = radius · (1 − cos turn)`, a few dozen metres out, and the join is one
solve rather than a search (`r = |off| / (1 − sign·dot)`).

**The mouth's width is capped by the ground, not by taste.** `groundAt`
finds the corridor by the nearest CENTERLINE point, so a mat whose width
changes faster than the samples are spaced leaves a probe at a wide sample's
lip nearest to a narrow one alongside — the ground hands over inside the
ribbon, and that is a face along the outside of the crossing. Widening
`junctionFlat`'s across-axis does not fix it (the 14 m lattice cannot follow
the platform's rim either). Measured on seeds 1-8 at medium: a mouth of
+0.13 road widths per side is clean, +0.18 puts three `rollers.seam`
findings on the sweep, +0.45 puts nine. Anything wider needs the terrain to
stop being a one-road corridor model first.
