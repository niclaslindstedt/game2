---
title: Per-sample ground must interpolate between samples, and takeoff is the body's momentum against it — never one frame's height against the last
date: 2026-08-26
scope: engine/game/track.ts, engine/game/car.ts, engine/mapgen/compile.ts
concepts: [elevation, ground-follow, sampling, phantom-launch, terrain, jumps, physics]
---

Track samples sit 2 m apart. A `locate()` that returns the nearest sample's
elevation makes the road a staircase: ground under a fast car steps ~0.5 m at
every sample crossing, a jump ramp climbs in stairs, and any "the ground fell
away" rule comparing this frame's height to the last fires on every edge —
phantom launches and respawn storms everywhere. Interpolate elevation AND
slope between the two samples the car is between (project onto the sample's
forward axis), do the same for any new per-sample field (banking, grip,
roughness), give the grounded car the road's own vertical speed (`vy =
u·slope`, so `vy/u` is a free, correct body pitch for the renderer), and keep
grades off the tight corners (`straightness` in compile.ts): a car cutting
inside a hairpin sweeps many samples of arc per step and ANY real grade
across that sweep reads as a cliff.

Takeoff is then never a height rule at all: the body's own momentum against
the ground (`car.loft`, the `air.hold`/`loft`/`leave` band in car.ts) is what
separates a brow the car only just outruns from one it is thrown by. Jump
lips keep their own rule (`ctx.lip`): their drop belongs to the ramp launch.
