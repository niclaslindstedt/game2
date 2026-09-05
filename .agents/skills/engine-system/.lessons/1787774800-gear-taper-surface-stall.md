---
title: A per-surface penalty still charged at 0.94·gearTop stalls the box in that gear — fade the penalty out below the shift points instead
date: 2026-08-26
scope: engine/game/car.ts, engine/game/defs/
concepts: [surfaces, gearbox, drag, top-speed, tuning]
---

The engine's per-gear torque tapers to ~26% by the auto/manual upshift
point (0.94·gearTop), so on any surface where `drag·(0.94·top)` exceeds
`gearAccel·0.26·power` for SOME gear, the car parks just under that gear's
shift threshold forever — the off-road surface sat at 97 km/h no matter
what drag/power combination was tried, always at whichever gear boundary
bound first. That is a speed cap by accident, and a worse one than a
stated cap: it lands on a different car at a different speed, so the
roster's gearing spread silently disappears.

The pattern that gives a surface a real cost without a ceiling: keep the
surface's linear drag BELOW every gear's taper floor (nature sits at 0.03
vs gravel's 0.028), leave `power` level with gravel, and charge the whole
of the surface's cost as an ACCELERATION penalty that fades to nothing
below the lowest top-gear shift point — `TUNING.surfaces.natureDig` over
`natureDigSpeed` (35 m/s, against a slowest-car top-gear shift at 42),
applied in `car.ts` via `wildPull`. Slow to get going, no ceiling but the
gearbox's. Pick `natureDigSpeed` against the SHIFT POINTS, not against
anything the ground does.

Same math also decides real top speed: nominal gearTop must overshoot the
target because equilibrium sits where `accel·taper(u) = drag·u` — solve
it numerically per candidate spec before trusting hand arithmetic.
