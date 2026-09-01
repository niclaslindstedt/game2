---
title: The apron behind the start line is real, on-road road — a car can be stood 30 m before the gate without touching the generator
date: 2026-08-29
scope: engine/game/track.ts, engine/game/step.ts, engine/mapgen/terrain.ts
concepts: [start-line, track-geometry, grid, placement]
---

R24 lays `STAGE_RULES.startZone.apron` (30 m) of flat dirt road off the BACK
of `track.samples[0]`, with the terrain shelf held flat under it — the rally
start's run-up. It is not decoration: `locate` returns `offRoad: false` and a
correct signed `lateral` for a car standing anywhere on it, because the only
thing that reports the end of a stage is `pastApron`, and that fires solely
past the apron's length. So anything that needs a car BEFORE the start gate
(a mass-start grid, a staged repro, a rolling start) just places it there.

Two things make placing on it easy, and both are worth knowing before writing
sample-hunting code. The apron is STRAIGHT — it is the first sample's heading
extrapolated — so a slot is placed by walking back along that heading
(`x - sin(h)·back`, `z - cos(h)·back`) at `samples[0].elevation`, exact, with
no interpolation and no snapping. And the forward axis really is
`(sin heading, cos heading)` with right at `(cos heading, -sin heading)`;
`pastApron` in `game/track.ts` is the definition to copy from.

The alternative — placing cars UP the road past the line by rounding to the
nearest sample — looks equivalent and is worse twice over: `samples[0].s` is
one step (2 m), not 0, so arc positions are offset; and any spacing that is
not a whole multiple of `SAMPLE_STEP` silently rounds, which turns an evenly
spaced grid into an uneven one nobody notices until they measure it.

The apron's length is also a real ceiling: derive whatever has to fit inside
it (`GRID_MAX` in `engine/sim/grid.ts`) from `STAGE_RULES.startZone.apron`
rather than hard-coding a number that quietly becomes wrong.
