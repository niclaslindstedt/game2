---
title: A launch keyed to the ground falling away must read the car's MOMENTUM as the lesser of wheel speed and smoothed grade — and the grade must be read behind the car, not behind the sample
date: 2026-09-02
scope: engine/game/car.ts, engine/game/ground.ts, engine/game/track.ts
concepts: [jumps, ground-follow, terrain, wrong-way, takeoff]
---

The jump lip needs no flag: a convex kink the wheels cannot follow is the
wheels' vertical speed being asked to drop by more than `air.edgeSpeed` in
one step (`kink` in car.ts), and that fires at the top of the ramp and at
the top of the landing face alike. Three readings of "what the car was
climbing at" were tried, and only the third holds:

- The smoothed grade alone (`roadVy`): against a wall the grade over a
  wheelbase reads 90 m/s of climb while the wheels go nowhere, and the wall
  launched the car.
- The wheels' own speed alone (`wheelVy`): a kerb lifts the wheels a hand's
  width in one step, which as a speed is a rally car's whole pace, and the
  car hopped 2 m off every kerb. The seat lifting the body over its footprint
  (`seatOn`) counted as wheel speed too, and launched a car set down on a
  hillside — so `wheelVy` is read off the ground under the car's MIDDLE along
  its path, never off the seat.
- `min(wheelVy, roadVy)`: a spike the grade never saw and a grade the wheels
  never climbed both read as nothing; what is left is ground the car has
  genuinely been up. The launch speed is `launchKeep` (0.5) of the wheels'
  speed, which reproduces the shipped ramp launch exactly because R6's ramp
  ends at twice its average grade.

The grade itself is `slopeOn`, a backward difference along the STAGE. For a
car pointed down the stage that is the road ahead of it, and at a lip it
reports the ramp running away under the nose — the wrong-way car launched
with a negative `vy` or not at all. `locate(..., back)` reads the other
neighbour; step.ts decides `back` off the car's heading against the hint
sample's before the pre-move fix.
