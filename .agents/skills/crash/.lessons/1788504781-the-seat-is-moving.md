---
title: The ground under a rolling body is MOVING — a closing speed read off `-vy` charges the car for its own rotation
date: 2026-09-04
scope: engine/game/roll.ts
concepts: [roll, contacts, friction, physics, coulomb]
---

`stepRolling` flies the body's CENTRE against `centreHeight(tilt)`, and that
curve is not a floor: it runs at `slope × rollRate`, which past a corner is
ten metres a second. Two consequences, and the module got both wrong at once.

**The chatter.** Around every corner handover `held` sits on gravity and the
body ticks in and out of contact each step. Reading the arrival as
`max(0, -vy)` books each of those as a ten m/s impact: seven contacts inside
a tenth of a second, each dragging `grip × descent` out of the travel, and
72 km/h went to 24 for a car that had touched nothing.

**The climb.** Even a genuine arrival is mostly not an arrival. A body lying
on its flank and simply turning on it has its centre climbing the next corner
under its own roll — that lift is paid for by `rollRate`, which `centreSlope`
already charges gravity against and `pivotKeep` already trades. Charging the
TRAVEL for it as well is the double-count the module's own comment warns
against two functions earlier ("Never the rotational exchange above") and
then commits.

What is honest is `min(closing, g × airTime)`: gravity is the only thing that
can have been adding to the fall while the body was off the ground, so the
free-fall gain is the whole of what the ground has to arrest. It is exact
rather than a fudge, because the flight departs the curve at `vy = slope ×
rollRate` — the body leaves ON the curve, so everything it gains after that
is gravity's.

Watch for this shape anywhere a body is integrated against a moving
constraint: the impact is the closing speed MINUS the constraint's own
motion, and the constraint's motion is somebody else's energy budget.
