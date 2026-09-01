---
title: A byte-identical sim table after adding a recovery path means the path is UNEXERCISED, not that it is safe
date: 2026-08-27
scope: scripts/simulate-run.mjs, engine/sim/
concepts: [simulation, regression, coverage, bot]
---

`make sim`'s eight seeds run clean — `respawns 0` in every row — so nothing in
the sweep ever wedges a bot. Adding reverse to the car and a back-out recovery
to the bot produced a table identical in every column to the baseline.

That is the right result for the forward-driving regression question and no
evidence at all for the new code: the sweep proved the change is inert, not
that it works. Read an unchanged table on a NEW code path as "unexercised" and
go stage the situation deliberately — a synthetic terrain in `tests/` with a
face the wheels cannot climb between the car and the road, driven by
`botInput`, is what actually exercised it (`tests/reverse_test.ts`).

The corollary for the columns that CAN move: `respawns` is the only one a
recovery change touches, and it is 0 across the default sweep, so it has no
headroom to show an improvement either. A recovery is proved in a test, not in
the table.
