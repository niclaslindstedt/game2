---
title: The chase camera floats a metre over the waterline, so water FX spawned at the car wash across the lens — spawn them on a ring
date: 2026-08-27
scope: pwa/src/game/renderer.ts, pwa/src/game/dust.ts
concepts: [particles, camera, water, readability, dust]
---

`CHASE_CLEARANCE` (camera.ts) refuses to let the chase camera drop under
water, so during any surface effect on a lake the camera sits ~1.3 m above
the waterline looking down at the car. A `puffy` particle spawned at the
car's own position and given any rise at all therefore drifts straight
through the near plane: it renders as a white bloom washing over a corner
of the frame, which is the one thing a soft big sprite must never do.

Two fixes together, and both were needed:

- Spawn surface FX on a RING around the hull (a random bearing, 1.3–2.2 m
  out) rather than at `c.x, c.z`. It keeps the puffs out of the lens and
  reads better anyway — water working AROUND a car, not a fountain bolted
  to its middle.
- Keep floating froth low: `rise` under ~0.4 m/s, a slightly negative
  `gravity` (it spreads, it does not rain back), and a life under ~1.3 s.
  A style tuned to billow is a style that reaches the camera.

Thrown water is the opposite style and should stay that way: many SMALL
hard droplets (size ~0.085), `rise` ~4.5 with a wide spread and a heavy
`gravity` ~13, so an entry reads as a column that arcs and falls. Count is
what sells it as a mass of water — a deep entry spawns 140–320 where a ford
spawns 24–70.
