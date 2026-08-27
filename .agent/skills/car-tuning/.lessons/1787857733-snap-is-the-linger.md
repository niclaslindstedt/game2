---
title: A slower `release` does not make a slide linger — `release` and the weathervane cancel, and `snap` is the only lever
date: 2026-08-27
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, drivetrain, oversteer, release, linger]
---

With the wheel centred and the power down, what decides how long a slide
lasts is the balance between the rear weathervaning the nose back toward
travel (`drift.releaseSnap × slip × releasing`) and the driven axle feeding
the slide (`grip.powerYaw`). At any real angle the weathervane wins by close
to an order of magnitude — 0.5 rad of slip gives `0.5 × 8 = 4` against a
`powerYaw` of about 0.6.

Two things follow, both counter-intuitive:

**Slowing `release` changes nothing.** It holds `sliding` up, and `releasing`
— which the weathervane scales with — is exactly that. The two cancel.
Halving the rear-driver's `release` moved a centred-wheel exit trace by 0.4°.

**Raising `powerYaw` to compensate is the trap `drift-feel` warns about**: it
lifts the hands-off equilibrium toward the full-lock park angle and the drift
starts steering itself.

The lever that works is scaling `releaseSnap` per layout
(`TUNING.drivetrain[*].snap`): a rear axle still under power resists being
pulled straight, an undriven one dragging does the pulling. At 0.7 for the
rear-driver and 1.15 for the front-driver, a centred wheel after a 50° entry
leaves the rear-driver at 11° after 0.4 s where the front-driver has gathered
up past centre — the layouts differ where a player feels it, with no
self-feeding torque raised at all.
