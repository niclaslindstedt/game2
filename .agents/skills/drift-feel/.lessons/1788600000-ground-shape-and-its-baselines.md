---
title: One `pace²·curvature` should serve both the takeoff and the grip — and the road's transverse baseline cannot be a fixed distance, or it reads a wheel rut as a compression
date: 2026-08-31
scope: engine/game/car.ts, engine/game/track.ts, engine/game/defs/tuning.ts
concepts: [slope, camber, takeoff, grip, load, baselines, ruts, sim-cost]
---

The road was read as a LINE: `ctx.roadCurve` was the centerline's own
vertical profile, so R16's crown, R19's bank and the shoulder break were
invisible to the takeoff whatever direction the car was going. And nothing
coupled vertical load to grip — `tyreLoad` knew only `car.settle`. The same
`pace²·curvature` the takeoff tests IS the load: below the launch threshold
the ground spends part of the car's weight following the shape and the tires
keep the rest. One helper for both, with the takeoff reading the pull itself
so a grip-side gain can never move where a shape throws the car.

**Baselines.** `crestSpan` is 12 m so a brow is judged by the hill and not
the road's texture; laid ACROSS an 8 m road it reaches into the country both
sides. But a fixed 2.5 m transverse baseline straddles a wheel-track trough
and reads it as a COMPRESSION — grip went _up_ in the ruts, on every road. It
has to be a SHARE of the half-width (the crown IS a half-width parabola;
`rut.maxAt` caps the tracks at 0.42 of it), capped at `ROAD_CROSS.reach`.

**Two probing traps.** `locate` clamped `slopeLat` to the mat while
`elevation` followed the whole corridor, so a car on the verge had its height
fall away while the handling insisted the ground was level — unclamp it, but
keep the clamp for a DECK, where past the parapet is air. And probing
`corridorOffset` past `reach` returns the value it holds for want of anything
to say: clamp the arms and take the uneven-arm second difference, as
`curvatureAt` already does at a stage's end.

**Sim cost lives in the gain, not the floor.** Floors of 0.65/0.75/0.85 all
doubled respawns identically: what costs the bots is the ±10% of an ORDINARY
road, not the rare deep unloading. And the sweep is chaotic — one seed went
218 s → 248 s → 202 s over gains 0.45 → 0.35 → 0.30, crossing
`simulation_test`'s 240 s cap in the middle. Judge the aggregates, never one
row.
