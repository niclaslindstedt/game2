---
title: Anything that only happens with another car on the road is invisible to `make sim` — that table drives a car ALONE, and `make heat` is the other half
date: 2026-08-29
scope: scripts/simulate-run.mjs, engine/sim/
concepts: [simulation, coverage, traffic, rivals, reading-the-table]
---

`simulateStage` — and therefore every row of `make sim`, `--sweep` and
`--field` — puts ONE car on the road. The bot's traffic eyes and the crews'
tempers never fire in any of them, so a change to either produces a
byte-identical table across all eight seeds and all three cars.

Read that correctly. For a traffic change the identical table is the PROOF the
change is contained (a bot handed no traffic must drive the stage it always
drove), not evidence the new behaviour works — which is the same trap as
`identical-table-means-unexercised`, arriving from the opposite direction.

`make heat` (`--race`, `engine/sim/race.ts`) is the table that actually
exercises it: the whole grid down one road at once, reporting contacts,
who drove into whom, and metres of folded panel out and in. Read the
per-difficulty header before the crew rows — contacts per race and panel per
race are what a difficulty's manners ARE.

Two numbers to know before reaching for it. One medium race of eight cars is
about 2 s of wall clock, so a three-seed × three-difficulty table is ~20 s:
fine for a Make target, far too slow to assert in `make test`. And the
emergent totals are noisy — a handful of shunts over a grid is one accident's
worth of variance — so pin the MECHANISM in tests (a temper makes contact; a
difficulty sets the temper) and leave the totals to the table.
