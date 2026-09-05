---
title: The analytic grade at a cell centre understates the lattice's triangle — declare a fade's rock by its PEAK over the band, not by the slope at the point
date: 2026-09-05
scope: engine/mapgen/terrain.ts, engine/analysis/ground.ts
concepts: [terrain, r31, r34, lattice, measurement, analysis]
---

`cutAt` declares the cone's join over a mountain as rock so the analysis
and the props treat it as a face. The first version read the fade's local
slope (`6t(1−t)·E/F`) at the query point and compared it to `climbable`;
the check then found triangles at 1.4-1.6 m/m with `cutAt` 0.2-0.3 beside
every branch. A 14 m cell spans a seventh of a 52 m fade, so a triangle
whose centre reads the gentle start has a corner on the steep middle, and
the point's exact analytic grade is the wrong number for a lattice.
`fadeGrade` now uses the fade's peak — `1.5 · E / F` — so the whole band
with more than ~15 m of excess is rock, which is what the band IS.

The same trap the other way: the check must exempt the country's own
scoured flanks (bare soil, bare land steeper than `verge.climb`), or a
fill standing on a mountainside is reported for the mountainside's slope.
Read that off `farHeightAt`, never the shaped field, or the exemption
covers whatever the road built.
