---
title: A crash that is wrong is one or two catastrophic STEPS — an average over the roll hides all of it
date: 2026-09-04
scope: engine/game/roll.ts
concepts: [roll, momentum, measurement, probes, debugging]
---

"A rollover stops dead" looked like a friction number and was not. Swept
across a 2× range of the shell's friction (now `roll.faceGrip`) AND
`roll.drag`, the distance a car covered
moved from 35 m to 39 m — flat, which is the signature of a loss the tuning
knobs are not the source of.

What actually found it was a probe that steps the run one step at a time and
prints any step where `hypot(u, w)` drops by more than a third of a m/s.
Three lines of output, and the answer was in them: a single step taking 9.2
of the car's 10.2 m/s, and four steps carrying the whole 25 m/s loss between
them, with a correct grind either side.

The general shape: **whenever a per-step cost is suspected, print per step
and threshold the print.** A per-second table (`make crash`'s own frame
table, at 6/s) is what tells you the crash is wrong; it can never tell you
which step did it, because a 120 Hz spike is invisible inside a 20-step
average. Both are needed and they are not the same tool.

And the corollary that made each fix land: in this module the answer has
never been "the friction is too high". It has been an arrival the body did
not make — the seat's own rotation, or the tyres touching down as the roll
passed through upright.
