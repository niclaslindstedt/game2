---
title: Anything that lets MORE rotation through a contact widens the hand-over leak and shrinks what the pedals are worth — read both bars before tuning
date: 2026-09-05
scope: engine/game/roll-contact.ts, engine/game/defs/tuning.ts, tests/roll_control_test.ts
concepts: [roll, contacts, measurement, tuning, surfaces, ledger]
---

The ground's GIVE (a share of an arrival the surface takes as its own furrow)
comes off `slamTurn`'s arrival, so a contact turns the body less and more of
its rotation survives. Two things moved with it, and neither was a bug:

- **The ledger's air->grd gain grew.** `carry` went from 5.3% on 37 steps to
  7.7% on 103 with the country's give at 0.25, and back to 6.1% with it at 0.
  The leak is the known hand-over one (the arm the flight hands up and the
  touchdown takes back), and it scales with how much rotation crosses the
  hand-over — keep more and it leaks more. Not a term to hunt.
- **The driver sweep shrank.** `roll_control_test`'s ninety trips had the
  throttle lengthening an accident by 0.40 s and the brake moving it by
  0.01 s. With the road's give at 0.15 that read 0.13 s and 0.21 s; at 0.06
  (a graded road is compacted stone under a loose skin), 0.18 and 0.07. Fewer
  accidents keep tumbling, and a body settled on a face is one the tyres no
  longer reach through — so the pedals have less to act on.

So a change here owes three readings, not one: `make crash`'s regime split,
`make roll`'s twelve rows, and the ninety-trip driver sweep. Sweep the road's
give against the sweep before choosing it — the number that reads right in
open country is not the number the road wants.
