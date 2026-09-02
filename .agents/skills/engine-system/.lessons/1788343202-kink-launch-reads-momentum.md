---
title: A launch keyed to the ground falling away must read the car's MOMENTUM as the lesser of wheel speed and smoothed grade, positive only — and the grade must be read behind the car, not behind the sample
date: 2026-09-02
scope: engine/game/car.ts, engine/game/ground.ts, engine/game/track.ts
concepts: [jumps, ground-follow, terrain, wrong-way, takeoff]
---

The jump lip needs no flag: a convex kink the wheels cannot follow is the
car's climbing speed being asked to drop by more than `air.edgeSpeed` in one
step (`kink` in car.ts), from either direction. What "climbing at" reads:

- The smoothed grade alone (`roadVy`): against a wall it reads 90 m/s of
  climb while the wheels go nowhere — the wall launched the car.
- The wheels' own speed alone (`wheelVy`): a kerb lifts the wheels a hand's
  width in one step, a rally car's whole pace as a speed — the car hopped 2 m
  off every kerb. The seat lifting the body counted as wheel speed too, so
  `wheelVy` is read off the ground under the car's MIDDLE along its path,
  never off the seat.
- `min(wheelVy, roadVy)`: a spike the grade never saw and a grade the wheels
  never climbed both read as nothing.
- ...and off the road only when POSITIVE: a car setting off down a 55° face
  after a cliff fall has no climb to lose and is glued down it (ungated, that
  plunge ended in a second launch and a retirement). The road is exempt: a
  shallow lip on a descent nets no climb at its top and still has to throw
  the car — `make sim` shows the lost lips as jumps dropping to zero.

The launch speed is `launchKeep` (0.5) of the wheels' speed, which
reproduces the shipped ramp launch because R6's ramp ends at twice its
average grade. At a LANDING the wheel speed is seeded from the ground itself
over the last step's travel, never `u · slope`: the smoothed grade at a
cliff foot reads 70 m/s.

The grade (`slopeOn`) is a backward difference along the STAGE. For a car
pointed down the stage that is the road ahead of it, and at a lip it reports
the ramp running away under the nose — the wrong-way car launched with a
negative `vy` or not at all. `locate(..., back)` reads the other neighbour;
step.ts decides `back` off the heading against the hint sample's.
