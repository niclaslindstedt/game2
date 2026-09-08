---
title: An advantage that saturates its own clamp is invisible — give the model a COST before giving a layout more of what it already has too much of
date: 2026-09-08
scope: engine/game/drivetrain.ts, engine/game/limits.ts
concepts: [drivetrain, traction, tuning, measurement]
---

`wheelspinLoss` spends the driven axle's bite as `1 - clamp(bite, 0, 1)`, so
a layout whose bite is already over 1 loses nothing and — this is the part
that costs a session — CANNOT BE GIVEN ANY MORE. The four-wheel drive sits
at 1.135 on sand. Widening its advantage moved the sim by exactly zero, and
the natural next move (widen it further) would have moved it by zero again.

The fix is not more supply, it is DEMAND: charge something against the same
budget so the ceiling stops binding. Holding station on a grade needs `g` of
gravity out of the driven tyres before the car moves at all, and it comes out
of the friction the pedal wants — subtract that (`drivetrain.climbCost`) and
0.71 / 1.14 / 0.50 on the level becomes 0.40 / 0.89 / 0.30 on a 25% climb,
which is a picture with something in it.

Two things to check before believing any drivetrain measurement:

- **Print the bite and look for the clamp.** If it is at or over 1 for the
  layout you are tuning, the knob you are about to move does nothing.
- **Whole-stage time will not show it.** A desert sweep's mean time moved
  0.0-0.6 s on a change that alters peak wheelspin from 0.10 to 4.72 between
  layouts, because stage time is corners. Measure the thing itself — a
  standing climb up a synthetic graded straight, `tests/drivetrain_test.ts`
  has the harness.

And the trap that ate the payoff: the auto box upshifts at `0.94 × gearTop`,
a fraction of the gear's top SPEED, which a steep climb never reaches. The
coupe parks in first at 74 km/h up a 25% grade with its wheels barely
spinning — all the traction in the world and no gear to use it in. That is
pre-existing (it does the same on main), it is trap 3 in this skill's list
seen from the other side, and it caps what any traction change can buy.
