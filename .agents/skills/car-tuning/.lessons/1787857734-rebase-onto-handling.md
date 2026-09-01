---
title: A handling change landing on main invalidates a car-balance tune — re-measure the sweep AND the plain table before assuming the rebase was clean
date: 2026-08-27
scope: engine/game/defs/cars.ts, engine/game/car.ts
concepts: [balance, rebase, simulation, regression, cars]
---

A roster tuned against one version of the slide model is not tuned against
the next one. Rebasing this branch onto a main that had added a traction
ceiling (`grip.latCeiling`) merged with only five textual conflicts, all of
them adjacent additions — and still changed the balance table substantially
and broke two tests.

What moved, none of it visible in the diff:

- the rear-driver's walking-pace tail-out fell just under the drift
  threshold (10.4° → 7.9°, threshold 10.3°);
- its time sideways on tarmac nearly tripled (13 s → 36 s a stage) and its
  pace there fell from −8.7% to −16%, because a ceiling that makes a car run
  WIDE past the limit punishes the loosest car hardest on the surface with
  the smallest breakaway;
- the four-wheel-drive started running off the road and needing respawns,
  because it was the only car whose gearing this branch had raised enough
  (166 → 202 km/h on that stage) for its deliberately lazy steering to stop
  being able to place it.

So: after any rebase that touches `car.ts` or `TUNING.grip`, re-run BOTH
`make sim` and `--sweep`, and re-run the feel probes. `respawns` going 0 → 2
against main's own 0 is the signal that a car has outgrown its own steering,
and the fix is that car's `stability`, not the bot.
