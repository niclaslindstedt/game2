---
title: In the gripped range the yaw is `steer × steerGain` with no surface in it, so grip could never tighten a line — and any speed gate on a slide must read GROUND speed
date: 2026-08-31
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [surfaces, grip, tarmac, steering, spin, speed-floor]
---

Two structural facts about this model, both found by measuring rather than
reading.

**Grip only ever subtracted.** `latCeiling` bounds what the tires deliver and
`breakaway` says how far sideways they go, but below the slide threshold the
yaw is `steer × steerGain` and `steerRate` is a property of the rack alone —
no surface term anywhere. So every car held a WIDER line on tarmac than on
gravel at the same lock (hatch 110 m vs 104, coupe 140 vs 119) while arriving
a third faster, and the paved section was a place to run wide. `steerGrip`
is the fix, and its reference has to be GRAVEL (against the car's own
`tyres.loose`), not an abstract 1 — quoted against 1 it made every car's
wheel worse on the surface most of the stage is made of, because a
loose-surface tyre rates under 1.

Watch what else reads `surfaceGrip`: it carries `tyreLoad`, the landing's
transient. Feeding that into the rack made a landed car slide LESS than one
on the flat (`tests/suspension_test.ts` catches it). Turn-in wants
`surfaceGripFor(spec, ctx.surface)` — the standing fact, not what is under
this car right now.

**And `speed` in `stepGrounded` is `|car.u|`, the along-the-nose component.**
A car at 70° of slip has almost none of it however fast it is travelling, so
a new spin state gated on `speed` dropped out the instant it succeeded and
re-entered next step: 26 counted spins in two seconds off one yank of the
lever. Anything gating a sideways state needs `Math.hypot(car.u, car.w)`,
which is why `slideFactor`'s own floor reads the speedo.
