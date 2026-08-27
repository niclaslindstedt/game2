---
title: A surface is two numbers — how hard it holds and how far sideways it goes — and only the first one existed
date: 2026-08-27
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [surfaces, drift, grip, tarmac, breakaway, angle-span]
---

`TUNING.surfaces.grip` scales the grip CEILING, which decides when the slide
comes in. On its own it made tarmac the model's outlier: the paved car reached
a HIGHER yaw rate and more lateral g than the gravel car at full lock (9.3 g
vs 5.7 g at 40 m/s), sat at 20° of slip, and kept its pace — a rally attitude
held on a surface that in reality peaks a few degrees off straight. Turning
the wheel's authority down on tarmac "fixes" it and inverts reality: tarmac
out-grips gravel, it just cannot be hung out.

The knob that belongs to a surface is where the tires LET GO —
`TUNING.surfaces.breakaway`, scaling `drift.angleSpan` and `drift.angleBand`
together. Asphalt at 0.55 dropped full-lock slip from 20.6° to 14.9° and yaw
from 2.62 to 1.79 rad/s while gravel stayed byte-identical, because nothing on
a gravel sample multiplies by anything but 1.

Two things worth knowing next time: scale `angleSpan` and `angleBand`
together, or the paved drift gets a sharp-edged saturation wall instead of a
small one; and the model has no traction circle at all — `gripAccel` gates the
slide but never bounds the lateral acceleration the redirect delivers, which
is why every car in the game corners at 3–7 g. That is an arcade choice, not
an oversight, but it is the reason a surface fix has to work on the ANGLE.
