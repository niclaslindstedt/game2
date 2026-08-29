---
title: A traction term that is SUBTRACTIVE inverts the layouts, because drivetrain_test measures a wet/dry RATIO
date: 2026-08-29
scope: engine/game/car.ts, engine/game/defs/tuning.ts, tests/drivetrain_test.ts
concepts: [traction, drivetrain, wheelspin, launch, bite, surfaces]
---

`drivetrain_test`'s "puts the power down where there is nothing to put it down
on" is the roster's whole four-wheel-drive case, and it is measured as
**wet pace ÷ dry pace**. That denominator is a trap for any new traction loss.

The existing loss is MULTIPLICATIVE in the axle's shortfall (`1 - bite`), so a
car with good bite loses little on both surfaces and the ratio survives. A loss
written as `throttle - hold` is SUBTRACTIVE, and subtraction hits whoever had
the most to lose: on dry gravel the four-wheel-drive's bite is over 1 and it
pays nothing, the front-driver pays a little, the rear-driver pays a lot — so
the rear-driver's DRY number falls, its ratio rises, and the layouts invert
without anything about water changing. Both the ratio and the absolute wet pace
flipped at `pedalSpin × spinLoss ≈ 0.15`; the margin to work in is small to
begin with (0.428 / 0.413 / 0.362 on a clean tree).

Two things fell out of it that are worth keeping. Keep the product
`pedalSpin × spinLoss` at or under about 0.1 — that is the real budget, not
either number on its own. And split a launch penalty by its SOURCE: the pedal
term is the one that reaches past the start line (every first-gear corner exit
runs through it) so it must stay small, while a clutch dump is a one-off
initial condition that costs the model nothing anywhere else and can therefore
carry the whole effect. Measure both the ratio and the absolute wet pace when
touching any of it — they can disagree, and the absolute one is what the design
claim actually means.
