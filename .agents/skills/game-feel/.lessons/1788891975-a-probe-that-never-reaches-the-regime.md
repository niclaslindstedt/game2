---
title: A scripted camera probe proves nothing about a reading whose regime it never reaches — hold nothing flat that the reading is made of, and run the window past every threshold
date: 2026-09-06
scope: tests/camera_test.ts, tests/camera_feel_test.ts
concepts: [camera, test-conventions, verification, game-feel, measurement]
---

`weave`, `straight`, `blowRun` and the jump runs script the car by hand, which
is what makes them clean probes — and is also how they silently pass a reading
that does not work. Two shapes of it, and the second one nearly deleted a live
rule as dead code:

- **A quantity held FLAT is a reading never exercised.** Those runs set `car.u`
  once, so anything taken off the car's ACCELERATION is exactly zero through
  all of them: the suite is green whether the reading works, is wired to the
  wrong rig field, or is never applied at all. A new rate-driven reading owes
  a run that varies the quantity — for the surge, a loop stepping `car.u` by a
  fixed m/s² and moving `car.z` with it — compared against a car HOLDING the
  speed it ended at, or the rig's own `distPerSpeed` shows up in the answer.

- **A window that ends before a THRESHOLD is crossed reads as no effect at
  all.** `FLOOR.sinkMax` is 16 m/s and a free fall needs 1.6 s to reach it, so
  a four-second probe whose fall starts at 2.5 s measured the rule with and
  without it and got identical numbers — the honest-looking conclusion being
  that the rule was dead. It fires from 1.6 s of fall onward. Before calling a
  branch dead, compute when its condition can first be true and run past it;
  instrumenting the branch's own inputs for one frame settles it in seconds.

Prove the fix the other way too: disable the reading (`master: 0` on its
`CAMERA_FEEL` group) and check the new cases actually go red.
