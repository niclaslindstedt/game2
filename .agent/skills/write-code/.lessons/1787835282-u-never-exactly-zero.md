---
title: `car.u` is never exactly 0 after a stop — the lateral-grip redirect rebuilds it after the standstill snap
date: 2026-08-27
scope: tests/, engine/game/car.ts
concepts: [test-conventions, physics, standstill, assertions]
---

`stepGrounded` snaps `car.u` to 0 below `TUNING.standstill`, but that snap is
not the last thing to touch it: the lateral-grip redirect at the end of the
step rebuilds `u` and `w` from the slip angle, and leaves sub-mm/s dust behind
(≈4e-4 m/s in practice).

So `expect(car.u).toBe(0)` on a stopped car fails, and the failure reads like a
physics bug rather than a too-strict assertion. Assert
`Math.abs(car.u) < TUNING.standstill` instead — that IS the engine's own
definition of stopped, and it is the threshold the reverse latch releases at.
