---
title: Per-surface linear drag stalls the gearbox under its own upshift threshold — cap speed with an explicit over-speed term instead
date: 2026-08-26
scope: engine/game/car.ts, engine/game/defs/
concepts: [surfaces, gearbox, drag, top-speed, tuning]
---

The engine's per-gear torque tapers to ~26% by the auto/manual upshift
point (0.94·gearTop), so on any surface where `drag·(0.94·top)` exceeds
`gearAccel·0.26·power` for SOME gear, the car parks just under that gear's
shift threshold forever — the off-road surface sat at 97 km/h no matter
what drag/power combination was tried, always at whichever gear boundary
bound first. The workable pattern: keep the surface's linear drag BELOW
every gear's taper floor (nature ended at 0.032 vs gravel 0.028) and cap
the surface's speed with an explicit over-speed term
(`max(0, u − natureTop) · natureOverDrag`), which places the equilibrium
exactly where the design wants it (~150 km/h) independent of gearing.
Same math also decides real top speed: nominal gearTop must overshoot the
target because equilibrium sits where `accel·taper(u) = drag·u` — solve
it numerically per candidate spec before trusting hand arithmetic.
