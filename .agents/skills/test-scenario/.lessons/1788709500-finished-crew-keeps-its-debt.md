---
title: A crew that finishes while paying its head start keeps a positive `owed` — check `done` before asserting the debt is paid
date: 2026-09-02
scope: engine/sim/field.ts, tests/
concepts: [field, stagger, test-conventions, placement]
---

`payHeadStart` and `settleField` both `continue` past a run that is `done`,
and a rival who reaches the line INSIDE the seconds it was still owed is
booked `done` with the rest of that debt left standing on `run.owed`. So an
assertion that "everybody's debt is paid" (`run.owed <= 0` over the whole
field) fails on any short stage with a quick field — not because the field
is wrong, but because the debt of a car that is home means nothing.

Assert on the crews still out — `if (run.done) continue` first — and count
them, so a field that is entirely home does not pass the loop vacuously.
The same shape applies to a crew's race clock: a finished crew keeps the
time it posted, so "clock = the player's + the intervals it left ahead"
only holds for the ones still driving.
