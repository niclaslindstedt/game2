---
title: A respawn is booked at the last BOARD, so counting respawn positions measures board spacing, not an absorbing loop
date: 2026-09-03
scope: tests/scars_test.ts, engine/sim/scars.ts
concepts: [scars, respawn, test-conventions, measurement, chaos]
---

`tests/scars_test.ts` asserts no crew is "sent back to the same place
forever", and counted `run.state.progressS` at the `respawn` event. That is
the SPLIT BOARD the car was put back at, and boards are hundreds of metres
apart — so a crew simply having a bad sector books five hits on one board
while leaving the road at 1195 m, 1470 m, 1350 m and 1637 m. The absorbing
state the scars module exists to break is the other thing entirely: the same
two hundred metres driven the same way and left at the same METRE.

Count where the run came undone instead — keep the last on-road `progressS`
per run, updated in the outer loop, and read it inside the `stepField`
callback (by the time the event is handed over, `progressS` is already back
at the board). On seed 14 hard that turns a worst-repeat of 5 into 2, with
nine respawns still in the sample, so the metric is sharper rather than
looser.

Worth knowing before you trust ANY number out of an 8-car contact heat: it is
chaos. Nudging one mirror's drag by one per cent swung the old count 5 → 4 →
3 → 5. Before reading a heat's respawn count as a regression, perturb an
irrelevant constant and see whether the number moves; if it does, the metric
is the bug.
