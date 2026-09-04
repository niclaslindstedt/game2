---
title: The crash ledger's leak is the WALK, unconserved at the ground/air handover — and four fixes for it all make the number worse
date: 2026-09-04
scope: engine/game/roll-ledger.ts, engine/game/roll.ts
concepts: [roll, measurement, physics, debugging, probes]
---

`make crash` reports `carry` "gaining" 20% of its budget. It is not a term
making energy — it is `crashEnergy` reading half of one motion.

A body going over turns about the CORNER on the ground, so `stepRolling`
carries the whole car sideways as it turns (`walk`, `stride`) — and writes
that straight into `car.x`/`car.z`, never into `car.u`/`car.w`. The VERTICAL
half of the same motion is in the state (`car.vy` is set to `seatVy`), so the
ledger counts the pivot on one axis and not the other two. That asymmetry is
also a real model fault: the walk is six or seven metres a second under a car
at eight rad/s, a fast roll leaves the ground four times a turn, and the
horizontal half of it is destroyed at every takeoff and created at every
contact.

Four fixes were tried and every one made the reported leak WORSE. Do not
repeat them: `mass.over` (corner radii) while grounded took `trip` 4.6% →
80.8%; dropping `vy` from `move` while grounded took `carry` 20% → 29%;
adding the walk to `move` alone (no model change) took it to 58–655%; and
conserving the walk across the handover as well — `car.u += pivot` at takeoff,
back out at the contact, with the weight's own arm — still left 66–101%,
spread over 265 steps rather than a few.

The last one is the physically right change (rolls carry further for it:
`carry` 2.02 → 3.26 turns, 32 → 50 m) and it still cannot be verified,
because `standingOn().height` JUMPS as the body walks from corner to corner,
so a `move` built on it is discontinuous several times a turn. A real fix
needs a continuous pivot arm first; until then the ledger cannot referee its
own repair, and changing the trajectory without an invariant is worse than
the leak.
