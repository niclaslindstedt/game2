---
title: A compile-time placer plans against the BARE country, and the terrain reshapes the ground afterwards — measure the built surface or ship the gap
date: 2026-09-03
scope: engine/mapgen/, engine/analysis/
concepts: [placement, terrain, measurement, roads, plausibility]
---

Everything placed in `compile.ts` reads `land.heightAt` — the geology's own
surface. What the player meets is `terrain.groundAt`, which is that surface
after the field has shelved every road, graded every pad and blended the
country up onto them. The two disagree by **tens of metres** near a road,
and a placer that never asks is placing against a surface that does not
exist.

R45's transmission line hit it three times in one session, each looking like
a different bug: a span promising 12 m over the road cleared the BUILT road
by 7.8 (the road rides an embankment); a tower on 4.5 m of surveyed fall
stood on 8.7 m of built fall (the road blasted a cutting under it); and a
span was drawn 37 m INSIDE a hillside (a branch's own shelf, invisible to a
query that only knew the route).

Three things follow, and they are the fix:

- **Model the shelf, do not ignore it.** A field of every road's own sample
  heights, eased back to the country over the terrain's `CORRIDOR_RANGE`
  (150 m), is enough. Holding it flat across that reach instead is
  over-strict and refused a third of the lines for nothing.
- **`shelfBand` is the compiler saying in advance where the cone will move
  the ground.** `energy.ts`'s `padAt` already checks it; any new placer owes
  the same check at every corner of its own footprint.
- **`roadDistanceAt` and `roadDistanceField` are BOUNDED.** A point that
  answers `Infinity` can still be one metre from a branch. Ask
  `branchClearance` too, or believe a lie.

The analysis is where this gets caught, because it reads the terrain: a
metric that measures the BUILT thing against the rule the placer planned to
is the only instrument that can see this class of defect at all.

And the built surface is `groundAt`, never `heightAt`: the analytic field is
what the lattice's CORNERS are sampled from, and between two of them it is not
the ground anyone drives on or sees. A check written on `heightAt` agrees with
the placer by construction and measures nothing.
