---
title: A move has to lift the DEPTH — demand and yaw alone cannot get past a layout's own ceiling, and letting one go raw fires the exit spring mid-corner
date: 2026-08-29
scope: engine/game/car.ts, engine/game/state.ts, engine/game/defs/tuning.ts
concepts: [drift, provocation, handbrake, flick, trail-brake, depth]
---

Making the hatch rotate on a pedal took a third term nobody had needed
before. `asked = smoothstep(demand) × open × depth`, so a layout's `depth`
caps everything: pouring demand in (the flick's throw, a brake's weight) and
yaw on top of it buys a big PEAK and then hands it all straight back, because
the setpoint every deepening force fades toward is still the shallow one. The
handbrake read as the exception only because `handbrakeYaw` is ungated — it
was reaching past the ceiling rather than raising it.

So a move lifts `depth` toward the reference: `depth + (1 - depth) × provoked`
(`drift.leverDepth` / `flickDepth` / `brakeDepth`, largest wins, not the sum).
The lift a move gives is the layout's own shortfall, which is the property you
want — it is worth most to the car with the least of its own, and nothing at
all to the rear-driver, who is already at 1.

**Then hold it.** `provoked` raw is a step function: the lever comes up in a
tick, `asked` collapses, `releasing = sliding - asked` jumps to near its
maximum, and `straighten = slip × releaseSnap × snap × releasing` fires a
several-rad/s spring at a car that is still mid-corner with the lock still
on. A 52° yank gathered to 3° half a second later and then rebuilt — a
pendulum, not an exit. `car.provoked`, held and decayed at `provokeSettle`
(~1.1/s), is the fix, and the front-driver's `snap` had to come down with it:
a weathervane sized for a slide the wheel asked for swings a provoked one
back through centre and out the other side.
