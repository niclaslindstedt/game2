---
title: The end aprons reach further than the sample grid's block — a query the block holds no sample for must still ask the aprons, or the run-out past every finish ends in a wall
date: 2026-09-06
scope: engine/mapgen/terrain.ts
concepts: [terrain, r24, apron, lattice, measurement, r31]
---

`nearestRoad` and `nearestSample` walk a 7×7 block of 48 m cells and
returned null when it held no sample — before asking the aprons. A point
on an apron's spine `CORRIDOR_RANGE` (140 m) out is that plus the apron's
own length (56 m) from the end sample, so between 144 and 192 m past the
finish the road's say stopped wherever that sample fell out of the block:
the fill's run-out was cut off with 9–14 m still to let go, ruled along a
lattice line (alpine seed 8, `ground.climb` at 54°). It read as a fault of
the crest rounding, which had only made the fill land 21 m later.

The tell: `roadDistanceAt` jumping from ~120 to `Infinity` between two
lattice corners. The probe is a walk straight past the last sample at a
few laterals, printing `roadDistanceAt` and `heightAt − farHeightAt`; the
fix is the fallback at the top of both searches' empty path.
