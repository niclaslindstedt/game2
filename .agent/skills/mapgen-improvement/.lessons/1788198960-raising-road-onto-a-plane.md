---
title: Raising road onto a platform — the plane must lie on the ROUTE's grade, and the ramp is not the platform
date: 2026-08-31
scope: engine/mapgen/compile.ts, engine/mapgen/road.ts
concepts: elevation, junctions, terrain, measurement, road-network
---

Two traps, both of which produced numbers nowhere near the ones the rules
named, when R36 lifted a crossing's platform above the country.

**A LEVEL plane makes the step a lottery.** The obvious reading of "the tarmac
stands `stand` proud" is a horizontal plane at `routeY + stand`. But the route
arrives on a grade, so the two edges of the platform sit at two different
heights above the road's own line — and where the country falls faster than
`stand`, the far edge is BELOW it: a hole with a road in it, not a jump.
Measured over seeds 1-24 a nominal 1 m step came out 2.0-2.9 m with 27-33%
ramps. Give the plane the route's own slope (base slope PLUS the rate its
`rolling` roll is climbing at — reading only the base leaves the roll to
diverge across the ramp, which is another five per cent) and the step is
exactly `stand` on both sides of every crossing on every seed.

**The falloff's peak slope is 1.5× its average.** `junctionFlat` blends on a
smoothstep, so a rise of `h` over a ramp of `L` peaks at `1.5·h/L`, not `h/L`.
Do that arithmetic before choosing either number.

**And the graded area is not the ramp.** Sizing the platform's `spread` to the
ramp length made `junctionFlat` — which the terrain, the renderer and the paving
all read — describe a 60 m plateau of bare earth with a face round its rim,
sitting in a field. Keep the platform junction-sized and give the RAMP its own
weight, blended along the route's arc and applied to `elevation` only: the road
keeps its crown, its camber and its gravel, and the terrain's shelf follows it
as a narrow embankment. The cost that remains is the lattice's: a platform
standing a metre proud leaves ~0.9 m between the ribbon's lip and the 14 m
ground tiles, which `roads_test`'s lip-gap tail measures.
