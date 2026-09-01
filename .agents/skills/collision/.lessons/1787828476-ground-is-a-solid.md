---
title: Ground-follow that assigns car.y = groundAt(x, z) lets the car drive up a vertical cliff — measure the rise against the ground it COVERED
date: 2026-08-27
scope: engine/game/car.ts
concepts: [collision, terrain, physics]
---

The off-road ground-follow used to snap `car.y` to the terrain unconditionally,
so a cliff face was climbed at full pace with only `TUNING.hills.gravityAlong`
(0.6 g along the grade) pushing back. That is the "it doesn't feel like the car
weighs anything" complaint in its purest form.

The check that works is per-step and local: `rise = groundAt(newX, newZ) −
car.y` against `run = hypot(newX − fromX, newZ − fromZ)`, i.e. the grade of the
ground the car actually covered this step. Do NOT reuse `ctx.slope`/`slopeLat`
— those are read over `TUNING.hills.gradeSpan` (4 m) and are deliberately
smoothed, so a metres-wide cliff averages out to a drivable bank.

Two details the model needs to stay playable: the contact NORMAL is the
terrain's own horizontal gradient (read over a short `faceSpan`, not the grade
baseline), which is what lets a face met at an angle deflect the car along it
instead of parking it; and the car must be backed out of the refused fraction
of the step, or the next step reads the same penetration again.
