---
title: A force that acts on "the car is going backwards" also acts on a collision rebound — latch the manoeuvre on INTENT, not on the sign of `u`
date: 2026-08-27
scope: engine/game/car.ts
concepts: [reverse, collision, physics, state, longitudinal]
---

Adding reverse means adding rules that fire when `car.u < 0`. That sign is not
private to reverse: `collideSlope` kicks the velocity backwards off a face the
wheels cannot climb, and gravity along a grade can do it too. A plain
`if (car.u < 0) …` catches all of it.

The concrete bite: a coast-down that gathers a backwards-rolling car to rest
(needed, because rolling drag alone lets a released reverse coast for the
better part of a minute) also erased the cliff rebound, so the car stayed glued
to the face and re-accelerated into it. `tests/suspension_test.ts` caught it as
a car still doing 18 m/s where it should have been under 12.

The fix is a LATCH on `CarState`: `reversing` is set by the pedal (brake down,
throttle zero, `u` at or below `TUNING.reverse.engageBelow`), stays latched
through the pedal coming up until the car is back inside `TUNING.standstill`,
and every reverse rule reads the latch instead of the sign. A rebound never
sets it, so the collision keeps every bit of its impulse.

Two more traps in the same block, both silent: the standstill snap
(`|u| < standstill && !throttle → u = 0`) eats reverse's own first tick unless
it stands down for the latch, and the brake's `-brake · sign(u)` term pushes
FORWARD once `u` is negative, so it must be replaced by the reverse thrust
rather than run alongside it.
