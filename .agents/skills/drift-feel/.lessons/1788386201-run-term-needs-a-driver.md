---
title: A past-the-peak run term must be fed by a MOVE and gated on pace, or the wheel's own lock sweep grows a cliff
date: 2026-09-02
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, spin, counter-steer, run-term, lock-sweep]
---

`TUNING.drift.overYaw` makes a slide carried past the wheel's park keep coming
on its own until counter-steer holds it — what turns "over-drifting" into a
spin the player did. Three things it must NOT do, each found the hard way:

- **Start at the wheel's own park.** The run begins at `overFrom` (0.7) of
  the fade band past the asked angle, where a held lock parks; started at
  the asked angle itself, the lock sweep in `tests/drift_test.ts` grew a
  cliff (36° → spin between two neighbouring lock values) and a held full
  lock no longer parked.
- **Need a driver.** Feed it from `CarState.thrown` (the move's throw, fading
  at `thrownSettle`) or a lifted throttle — never from landing skitter or a
  chained entry alone, or every landing and every second corner of a
  chicane spun the bot.
- **Gate it on pace and on `spun`.** `overSpeed` past the slide floor keeps
  the lever's hairpin pivot a pivot; off once spun, or the spun car keeps
  rotating forever.

Probe it with a held flick at 28 m/s on the rear-driver (`probe-spin`
style: peak, spins, end slip): the uncaught flick should run to a spin in
about a second, the catch at 35° should gather it, and `make drift
ARGS=--table` must move under a tenth of a degree everywhere else.
