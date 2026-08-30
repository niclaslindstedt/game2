---
title: A road laid at a height of its own makes the country beside it flat, whatever the geology says
date: 2026-08-30
scope: engine/mapgen/compile.ts, engine/mapgen/terrain.ts
concepts: [elevation, terrain, plausibility, road, cut-and-fill]
---

`buildRolling` used to be the WHOLE of a road's height: 1-D noise along arc
length, drawn without ever asking what the ground under it was doing. Measure
`land.heightAt(sample) - sample.elevation` along a stage and it ran ±40 m,
with one seed's road 30 m under the natural ground for its whole length.

That is the real reason a stage reads as flat. The terrain blends corridor →
`far` over ~110 m and caps everything with R31's cone, so it has to plane tens
of metres of arbitrary offset away next to every road — and planing that away
is what eats the relief. Raising the geology's amplitudes does not fix it; it
just makes the terrain plane harder.

The fix is a causal lag + gradient clamp + vertical-curvature clamp on the
land height along the route (`elevation.follow`). All three are needed: the
lag alone leaves brows the cars land on (sim air time nearly doubled and three
of twenty-four cars wrecked), and lengthening the lag to fix that stops the
road following the country at all, which takes the cuttings with it.

Two things it breaks that are not obvious. Synthetic rigs (`compileTrack`)
signalled "flat" by passing `rolling = () => 0`; a follower inside
`createCompiler` ignores that and quietly gives every physics test a
hillside — 25 tests failed across collision, camera and reverse. And the road
will follow the land straight into a lake unless the follow TARGET is clamped
to a freeboard over `LAKE_Y`, measured on the finished surface (base + roll),
not on the base.
