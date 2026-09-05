---
title: Never let the springs' pitch past attitude.pitchMax — the run reads a larger pitch as a crash — and charge a face to the belly by the WHEELS' jump alone
date: 2026-09-05
scope: engine/game/car.ts, engine/game/body.ts, engine/game/step.ts
concepts: [collision, climb, attitude, roll, belly, landing]
---

`CarState.pitch` is two things: the nose angle a driven car carries on its
springs, and the rotation a crashing box has been left at. `settlePitch`
clamps the first at `attitude.pitchMax` so that step.ts can read anything
past it as the second (`onItsWheels`, `goesOverEnd`). Letting the springs
lie on a 56° bank by raising the clamp to `wallSlope` therefore marked every
car on a steep bank OVERTURNED: `stepOverturned` returned before anything
moved, the car froze on the spot with its speed intact, and four suites
went red at once with the same frozen rows — a cliff, a bank, a creep off a
table, a face at a crawl. The seat (`corners`) already lifts the body clear
of a face; the attitude does not need to follow it.

And a face met at pace reaches the belly only through what the WHEELS did:
`wheelVy − prevWheelVy` over `collision.faceLand`. Read against the smoothed
grade's prediction as well, a car creeping off a table — the grade reading a
40 m drop the wheels had not made — folded its floor on thin air.

Probe such a freeze with a per-step row (x, y, u, vy, wheelVy, pitch,
airborne, zones[0], respawns): identical rows for a second, then a respawn,
is the overturned/retire path, not the physics.
