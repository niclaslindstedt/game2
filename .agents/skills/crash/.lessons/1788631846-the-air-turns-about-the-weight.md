---
title: A body in the air turns about its WEIGHT in all three axes — and a surface velocity is never a finite difference of the terrain
date: 2026-09-05
scope: engine/game/roll.ts, engine/game/roll-hull.ts
concepts: [roll, kinematics, origin, weight, contacts, terrain, probes]
---

`CarState.x/y/z` is the ORIGIN (the wheel plane under the car's middle) and
the weight rides half a metre above it. Between contacts the body turns about
its weight, so the WEIGHT flies straight and the origin goes round it.
`weightOverOrigin` hands that over in height; `weightFromOrigin` does across
and along, in the world so the yaw is in it — the same identity the ground's
walk uses (the origin moves by minus the change in the fixed point's turned
offset), asked of the weight instead of the corner. Without it the origin
flew straight and the weight swung round the wheel plane on the arm of its
own height: a car spinning on a bar held at ground level, which read from
every seat as "rotating on an axis below the car". `tests/roll_axis_test.ts`
holds it.

**The repair that is WRONG for what it exposed.** With the origin walking at
`height x rollRate`, the terrain under the corners changes more per step and
the contact test (`seatVy - vy`, the attitude's share only) books the ground
rising under the travel as arrivals: three contacts in three steps at
`descent` 0.01 after one real roof contact. Pricing the ground's rise as
`(rollSeat(now) - rollSeat(before)) / dt` is catastrophic: the terrain has
steps at the road's edges and `rollSeat`'s corner cap is piecewise, so a
centimetre of jump over one step is a metre a second, and it goes straight
into `car.vy` at every takeoff — `carry` left at +10 m/s and flew for 0.9 s.
A surface velocity comes from a slope, never from a one-step difference. The
chatter itself costs almost nothing (the exchange scales with the descent)
and predates the change; its real cost is the spurious `impact` events.

**One scenario re-rolls under any kinematic change** — `carry` went 3.6 s /
0.47 g to 2.0 s / 0.65 g on one roof arrival's exchange, from half a metre
of origin path. Judge on `make roll`'s sweep and the whole set's g.
