---
title: A pad is CUT by the cone of the road that runs onto it once it outgrows the cone's bench — hold the R31 ceiling at the pad's level
date: 2026-09-02
scope: engine/mapgen/terrain.ts, engine/mapgen/farms.ts
concepts: [pads, r31, terrain, homesteads, placement, measurement]
---

`rawHeight` lays the pad (weight 1 inside its radius) and THEN cuts the whole
lot to R31's cone, and the drive that runs onto the yard has a cone of its own
read from its underside. Along the drive that ceiling sits `TILE_SINK`-ish
below the pad's flat and out at the rim the cone has risen above it — so a
yard wide enough (a farm's 22 m against a house's 12) comes out cut along the
drive and flat at the rim: a trough 0.4 m deep, invisible in a top-down
preview, caught only by `homesteads_test`'s "graded flat" ring probe.

The fix is one line: the pad's level is a FLOOR on the ceiling, by the pad's
own weight (`if (padWeight > 0 && padFlat > ceiling) ceiling += …`). A pad is
graded level with the road that serves it by construction, so it is never the
wall R31 exists to take down.

How it was found is the reusable part: the analytic `heightAt` disagreed with
the pad's arithmetic, and no amount of reading the placer explained it. A
temporary `console.log` INSIDE `rawHeight` after the pad stage — printing
`pad.y@weight`, `base`, and which road was nearest — named the stage in one
run. When a field's output contradicts its own inputs, instrument the field,
not the caller.
