---
title: A time placed against a field is its rank in the field's CLEAN race — the recorded place only agrees when nobody shared road with the player
date: 2026-09-02
scope: tests/tape_test.ts, engine/sim/race.ts
concepts: [tape, field, classification, determinism, test-conventions]
---

`placeAmongField` drives the crews with nobody on the road (and each one
alone); `race()` steps them with `stepField`, where they see and touch each
other and the player rubs them. So a crew's raced time and its clean time
can differ by seconds — on seed 42 MEDIUM, Sprat is 5 s slower raced than
alone, because it catches the bot's own slow lap and drives around it. The
"places a time against a field" case in `tests/tape_test.ts` asserted
`placed.place === recorded.place` on that field and passed only because
the player's time happened to fall on the same side of Sprat both ways; a
one-second change to the player's lap (any handling change) flipped it.

`main` settled it by making the precondition the fixture: the case races a
HARD field, where the bot's lap is quick enough that no crew ever shares
road with it, so the raced and the clean race are the same race. If a
handling change ever makes the hard field catch the bot on that stage, the
honest alternative is the accounting — the placed place is the time's rank
among the clean rows, and the recorded place differs from it by exactly
the crews the traffic moved across the player's time — not a different
seed. `race.ts`'s docstring on `placeAmongField` says which race the
number is quoted against.
