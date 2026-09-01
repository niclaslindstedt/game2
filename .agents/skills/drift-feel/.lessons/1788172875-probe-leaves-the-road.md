---
title: A held-lock probe drives off the road within two seconds and starts answering about `nature` — widen the TRACK's width, not the samples'
date: 2026-08-31
scope: engine/game/car.ts, engine/game/defs/tuning.ts, tests/drift_test.ts
concepts: [probe, surfaces, tuning-loop, verification, off-road]
---

The lock sweep this skill prescribes curves the car off a compiled straight
in about two seconds, and from there `ctx.surface` is `nature` — a different
grip, a different breakaway, and a silent wrong answer to any per-surface
question. It cost this session three separate false conclusions: that a new
turn-in term did nothing, that it had made GRAVEL lazier, and that tarmac
and gravel cornered identically. All three were the car measuring the verge.

The fix is one line, and it is the one that is easy to get wrong: **set
`track.width`.** A sample's own `width` is not where the ground under the car
is read from — widening only the samples leaves `state.offRoad` true and
changes the measured radius by under 2 m. Measured on a compact at 0.45 lock,
30 m/s, 2.5 s:

| track / samples | radius | surfaces seen  |
| --------------- | ------ | -------------- |
| as compiled     | 63.6 m | gravel, nature |
| samples 900     | 64.5 m | gravel, nature |
| track 900       | 62.6 m | gravel         |

Assert `state.offRoad === false` across the sample window rather than
trusting a number that looks plausible — the contaminated readings are all
within a few metres of the clean ones, which is exactly why they convince.

The same trap sits in `tests/drift_test.ts`: its shared `game()` helper sets
`width: 220`, which holds a corner but not a held lock, so any new
surface-comparison test needs the wider `circuit()` helper beside it.
