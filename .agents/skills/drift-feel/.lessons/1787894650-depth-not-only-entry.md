---
title: Where a slide STARTS and how far it DEVELOPS are different knobs, and only the first one used to be per-layout
date: 2026-08-28
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, drivetrain, entry-band, layouts, surfaces]
---

`TUNING.drivetrain[].entry` moves the threshold on `demand`; past it every
layout ran up the SAME `entrySpread` ramp. So a front axle out of grip
produced the same tail-out angle as a lit-up rear one — and since the
front-driver's rubber is the first to give up on the loose, the hatch was the
slidiest car in the game on gravel while measuring correctly on tarmac. The
fix is a second per-layout number, `depth`, multiplying `asked` in
`slideFactor`.

Two things that make this non-obvious:

- **`entry` and `spec.gripAccel` are the same lever** — the slide starts when
  `u·steer·steerGain > gripAccel × surfaceGrip × entryAt × entry`, so sweeping
  one covers the other. But `gripAccel` ALSO sets the traction ceiling
  (`car.ts`, `gripAccel × latCeiling × grip`), so moving it changes how hard
  the car corners as well. `entry`/`depth` are the clean layout levers;
  `gripAccel` is not "only the slide threshold" whatever its doc comment says.
- **`depth` must stay ≤ 1.** `releasing = clamp(sliding - asked, 0, 1)` and
  `sliding` is clamped to `open` ≤ 1, so `depth` above 1 pins `releasing` at
  zero and the exit stops existing. At 1.25 the tarmac exit went bimodal —
  19.7° past centre at one setting, 84° (a spin) a notch away. Make the
  rear-driver the 1.0 reference and express the others as what they give away.
