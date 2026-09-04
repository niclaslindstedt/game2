---
title: The crash ledger's leak is the ground/air handover, not a term in the model — and two obvious fixes make it worse
date: 2026-09-04
scope: engine/game/roll-ledger.ts, engine/game/roll.ts
concepts: [roll, measurement, physics, debugging, probes]
---

`make crash` reports `carry` "gaining" 20% of its budget over 227 steps, and
it reads as a term making energy. It is not. Walk the run and print every
step whose ledger rose: the worst are all steps where `stepRolling` sets
`car.vy = seatVy`, taking the body from −0.65 to +2.63 m/s. That vertical
speed is the SEAT's own motion under a body pivoting at three rad/s — a
readout of the rotation, not an independent momentum — and `crashEnergy`
books it as translation on top of the `spin × rate²` producing it. The `walk`
along the ground is the same motion on the other axis and is NOT in `car.u`,
which is exactly why the leak looks like a term rather than bookkeeping.

Two one-line fixes were tried and BOTH made it worse, so do not repeat them:
using `mass.over` (corner radii) while grounded took `trip` from 4.6% to
80.8%, and dropping `vy` from `move` while grounded took `carry` from 20% to
29%. Each removes the double count and moves the discontinuity to the
takeoff, where `airborne` flips true with `vy` already set to `seatVy`. The
committed form is the least bad of the three.

Beware the other end of the same function: `crashEnergy` counts `g × height`
against the WORLD's zero, so a car standing still on ground 16.9 m up already
reads 273 J/kg. `jump_test`'s "a crash runs its budget down to a tenth"
passed for years only because the car ended on its roof and was respawned
onto a road sixteen metres lower. Subtract the datum — the same car, there,
at rest — from both ends, or the assertion is about the map's altitude.
