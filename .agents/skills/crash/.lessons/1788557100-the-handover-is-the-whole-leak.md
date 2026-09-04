---
title: The crash ledger's leak is the ground/air HAND-OVER, and every way of charging it flattens the roll
date: 2026-09-04
scope: engine/game/roll.ts, engine/game/roll-contact.ts, engine/game/defs/tuning.ts
concepts: [roll, measurement, physics, debugging, probes, tuning]
---

Tag the leak BY REGIME (was/is airborne) before theorising; `make crash` prints
that split now. A flat 20% went to unrelated faults on the first run of it,
and none would have come out of reading the frame table.

Two of the three are now rules in SKILL.md (a flight does not ride the
terrain; a contact is a corner CLOSING). Both were invisible in the frame
table and obvious in the regime split.

**What is left is the hand-over itself, and it is not a bug to be found.** A
flying body turns about its weight; a grounded one turns about its corner and
carries the weight on that arm — so the ledger's `vy` and the grounded step's
`mass.over` disagree by a fifth of a fast roll's budget, once at the takeoff
and once at the touchdown. Two cures work and both are wrong: scaling the
rotation to what the arrival could pay for, and settling the residual as a
normal impulse at the corner. Each takes the worst gain 32% -> 18%, and each
flattens `make roll` to **half a turn at every entry from 24 to 50 m/s**,
because they charge at every touchdown and a fast roll makes far more of them
than a slow one. The exchange is already priced once, by `pivotKeep`.

**And sweep SEEDS before tuning anything off the lab's default.** On seed 1
`carry` read 0.70 g where its mean over eight seeds was 0.45, range 0.28–0.70:
one draw of a chaotic process was about to buy a retune the model did not
need.
