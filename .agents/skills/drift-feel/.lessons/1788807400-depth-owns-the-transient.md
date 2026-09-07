---
title: A move's PEAK angle is `depth`, not the move's own knob — the layout's knob only sizes the demand
date: 2026-09-07
scope: engine/game/defs/tuning.ts, engine/game/limits.ts
concepts: [drift, drivetrain, flick, layouts, saturation-band]
---

Asked to calm a rear-driver whose flick peaked at 48° against a front-driver's
29°, the obvious lever is `drivetrain[].flick`. It is the wrong one: cutting
it 0.75 → 0.45 moved the peak by 1.2° on soft corners and not at all on
medium ones.

`flick` scales the DEMAND (`grip.flickThrow`) — it opens the slide.
`grip.flickYaw` walks the car through, and how far it may walk is the
saturation band, sized on `askedSlip` = `angleSpan × breakaway × asked`, where
`asked` runs off `depth`. **A layout at `depth: 1` has a band that never
shuts**, so every transient runs to the ceiling however little demand made it.
`depth` 1 → 0.7 took the same peaks 48° → 38° and 41° → 29°.

Reach for `depth` when the car flies away from the driver; reach for the
move's own knob when the move does nothing, or everything.

Two knobs move WITH `depth` and cannot be read alone:

- **`spin`** — the walking-pace tail-out is `spin` measured through `depth`,
  so a third off `depth` drops the slip under `enterSlip` and fails
  `drivetrain_test`'s signature claim. 1.9 → 2.4 landed it back.
- **`cap`** — lowering it 0.96 → 0.93 made two provoked bouts saturate at the
  identical angle, killing an unrelated chain test that then had no room
  above it to show in.

`entry` looks like this knob and is not: 0.82 → 1.05 cost so much development
that at 0.85 lock the rear-driver settled BELOW the front-driver — inverting
the roster's headline ordering while leaving the flick peak untouched.
