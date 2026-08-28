---
title: Measure water bugs against the RIDDEN ground and split the count by road proximity — the analytic field always says the river is fine
date: 2026-08-28
scope: engine/mapgen/river.ts, engine/mapgen/terrain.ts
concepts: [terrain, water, off-road, measurement]
---

`heightAt` is the analytic field; `groundAt` is the 14 m lattice the tiles are
drawn on and the car rides. A river is carved into the FIRST and queried
against it, so every water invariant stated in terms of `heightAt` passes by
construction and tells you nothing. State them against `groundAt`.

Doing that naively reports ~60% of a stage's river as "water with ground over
it" and sends you off widening the carve. Split the count by
`roadDistanceAt` first: out in the country only ~6% was wrong, and the whole
rest was river running INSIDE a road corridor — under bridge decks (correct,
R13) and down the corridor between two crossings (the actual bug). One
`roadDistanceAt < width/2 + reach` filter turned a "the terrain cannot hold
its rivers" rewrite into a 40-line routing rule.

The probe worth keeping: for every road sample that is neither `surface ===
"water"` nor `deck !== null`, assert `waterAt` is null; and for every point in
`terrain.streams`, compare `groundAt` against the point's own `y`. Both run in
seconds over a dozen seeds and both moved by two orders of magnitude on this
fix (1061 → 2 flooded road samples).
