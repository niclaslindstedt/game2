---
title: A crash that is wrong is one or two catastrophic STEPS — an average over the roll hides all of it
date: 2026-09-04
scope: engine/game/roll.ts
concepts: [roll, momentum, measurement, probes, debugging]
---

"A rollover stops dead" looked like a friction number and was not. Swept
across a 2× range of `roll.faceGrip` AND `roll.drag`, the distance covered
moved from 35 m to 39 m — flat, which is the signature of a loss the tuning
knobs are not the source of.

A probe that steps the run one step at a time and prints any step shedding
more than a third of a m/s found it in three lines: one step taking 9.2 of
the car's 10.2 m/s, four steps carrying the whole 25 m/s loss between them,
and a correct grind either side.

The general shape: **whenever a per-step cost is suspected, print per step
and threshold the print.** A per-second table (`make crash`'s own frame
table, at 6/s) is what tells you the crash is wrong; it can never tell you
which step did it, because a 120 Hz spike is invisible inside a 20-step
average. Both are needed and they are not the same tool.

**And go one level finer than the step: probe per STAGE inside it.** Drop a
temporary hook into `stepRolling` and call it after each thing that moves a
rate — gravity, the rub, the damps, each contact, the flight — then print
only the stages whose delta clears a threshold, with the attitude beside it.
That is what named all three faults in the spin: the row said `rub`, so it
was not the contacts; the row said `rotateSpin` with the pitch unchanged, so
it was a one-way exchange. Widen the same hook to dump `standingOn`'s own
answer (span, lever, patch offset) at the moment it is used and a dead
geometric gate shows up as a column of zeros. Remove it before committing —
it is a diagnostic, not a feature.

And the corollary that made each fix land: in this module the answer has
never been "the friction is too high". It has been an arrival the body did
not make — the seat's own rotation, or the tyres touching down as the roll
passed through upright.
