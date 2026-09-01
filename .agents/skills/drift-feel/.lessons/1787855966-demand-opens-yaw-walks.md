---
title: A demand spike only opens the door — it takes a YAW term to walk the car through it, and a transient sourced from the rack lasts 50 ms
date: 2026-08-27
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, flick, steering, weight-transfer, slide]
---

Adding the Scandinavian flick meant learning two things the slide model does
not make obvious.

**The slide factor does not rotate anything.** Feeding a flick into
`slideFactor`'s demand pushed `car.slide` from 0.08 to 0.6 and changed the
resulting slip angle by nothing measurable. `sliding` only lowers lateral grip
and gates the damping; every force that actually turns the car is either the
wheel's own `steerTerm` (which the saturation band pulls back toward
`angleSpan × asked`) or an explicit torque. Anything meant to get the car
sideways needs BOTH: a demand term to take the grip away and a yaw term to
walk it through the gap. Sizing the yaw near `handbrakeYaw` kept it under the
wheel's authority.

**A transient read off the rack is gone before it does anything.** At
`rackRate` 13 the lock crosses from one side to the other in about six ticks,
so a term gated on the rack's velocity is ~50 ms long — at `yawResponse` 8/s
that is ~0.3 rad/s of yaw for a twentieth of a second, i.e. under a degree of
heading. The fix is to LATCH the load on `CarState` and decay it
(`flickSettle`, ~0.45 s): what the tires feel is the weight that was thrown,
not the hands that threw it. `car.slide`'s own `release` already works this
way — the same shape, for the same reason.

Verify a flick by comparing the same lock driven straight in against the same
lock preceded by a full-lock throw the other way, sampled through the corner.
Comparing PEAK slip over a window that includes the pre-flick slide decaying
the other way reads as a regression when nothing is wrong.
