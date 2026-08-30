---
title: Measure a difficulty ladder in SECONDS — a place in the field's tail has almost no resolution
date: 2026-08-30
scope: engine/sim/, tests/tape_test.ts
concepts: [difficulty, bot-tuning, measurement, simulation]
---

`tape_test`'s ladder assertion placed one recorded bot lap against easy,
medium and hard fields and required the integer PLACE to get no better as the
field improved. A bot's own lap comes home in the last third of its own field,
and down there the crews are seconds apart: a whole step of the ladder is
worth a place or none at all, at random.

So the test read 38 against 37 and called the ladder broken while the ladder
was fine — the same six roads measured 62.2 s / 58.0 s / 56.2 s median field
time, strictly monotone, with accident rates back in line. Adding seeds does
not help; the statistic has no resolution wherever the lap lands.

Measure the GAP IN SECONDS to the field's median instead. Same claim ("the
same lap is worth less against a better field"), full resolution, and it
stops a generator change that moves stage geometry from reading as a
calibration regression.

The general rule: when a sim assertion is an integer over a bunched
population, check what one step of the thing being measured is actually worth
in that integer before trusting a failure.
