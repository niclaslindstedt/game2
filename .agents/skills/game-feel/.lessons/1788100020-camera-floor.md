---
title: The chase camera's floor is read at the CAMERA's xz, water included — and how it MOVES matters more than where it is
date: 2026-08-27
scope: pwa/src/game/camera.ts
concepts: [camera, terrain, clipping, cliff, shake]
---

The chase camera trails the car, so on a descent the ground BEHIND is higher
than the ground under the wheels and `car.y + height` puts the camera inside
the hill. Replaying the camera placement in Node against the real terrain over
ten seeds: 4.3% of off-road frames had the camera under the surface, worst case
4.35 m deep. No amount of height above the CAR fixes it — the floor has to be
read at the camera's own position, and `waterAt` belongs in it beside
`groundAt` (a lake surface is opaque from underneath).

But a floor applied as a bare `max(want, groundAt(here))` is the SHAKE players
report on a cliff top. Three things make that reading jump: `terrain.groundAt`
is not continuous — a fine scan of one stage found 21 near-vertical steps up to
28 m where fields meet — a shoreline swaps ground for water, and on steep ground
a few centimetres of lateral wobble is metres of vertical one, so sampling the
terrain at the SHAKEN position turns an impact shake into a terrain shake.
Measured on the worst seeds: single-frame camera jumps of 8–17 m.

Three rules fix all of it, and cost nothing on normal ground (a bot lap's mean
camera height and mean jerk are unchanged to three decimals): read the ground
over a FOOTPRINT (centre plus four corners at ~1.8 m) rather than a point; read
it before the impact shake is added, not after; and let the floor rise at once
but sink only at a bounded rate (`min(gap·10, 16 m/s)` — brisk enough that a
steep descent still tracks within a metre). Worst-case jerk drops to under 1 m.
