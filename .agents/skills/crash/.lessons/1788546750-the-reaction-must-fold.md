---
title: A contact's reaction must saturate as the shell FOLDS — resolved in full it annihilates the roll it is supposed to steer
date: 2026-09-04
scope: engine/game/roll-contact.ts, engine/game/defs/tuning.ts
concepts: [roll, contacts, physics, coulomb, measurement]
---

The fall's normal impulse at a corner is what lets the ground change what a
crash IS rather than only how fast it runs out (`slamTurn`). Resolve it as a
textbook inelastic contact and it is correct arithmetic and a broken crash:
in `carry` one arrival at 10.7 m/s took the roll from 7.65 to 0.80 rad/s in a
single step, the retardation went 0.42 g → 0.86 g, and a 2.5-turn accident
became one turn ending on its wheels. A rollover is not a stop.

The missing physics is the FOLD. A panel is not a billiard ball — it
collapses at a roughly fixed force over its stroke, so the faster a corner
arrives the more of the arrival goes into the metal and the less into turning
what is left of the car. The asymptote is `collision.structure.fold`, read
per FACE through `structure.ts`'s `foldSpeed` (a crumple zone, a flank, the
floorpan, the cage — divided by the car's mass ratio, and climbing toward the
bare cage's figure as the face folds to its cap), as `arrival × fold / (fold

- arrival)`: a gentle contact passes on nearly all of it, a violent one about
a quarter. It is the same arrival `landingDamage` is booking parts off for
  two lines below, priced once on each side.

The asymptote is chaotic in the single scenario — as one number for every
face, 2.0 gave 0.60 g, 2.5 gave 0.41, 3.0 gave 0.68 — so judge it on the
SPREAD (`make roll`'s twelve rows), never on `make crash CRASH=carry` alone.
A rollover's outcome is genuinely sensitive to its first contact and one
number will happily fit one seed.
