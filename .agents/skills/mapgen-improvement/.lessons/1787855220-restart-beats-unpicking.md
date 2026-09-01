---
title: A search with a hard terminal constraint is faster restarted than unpicked — cap backtracks low, raise the sub-seed attempts
date: 2026-08-27
scope: engine/mapgen/circuit.ts, engine/mapgen/generate.ts
concepts: [search, backtracking, performance, seeds, circuit]
---

The circuit search (R22) has to CLOSE, so unlike the sprint it cannot stop
early when it is boxed in — and with only the per-draw length cap to stop it,
it place-and-backtracked against the band ceiling until the iteration budget
ran out. Every failing attempt cost the full budget, and a medium circuit took
~130 ms to generate (xlong ~440 ms) against a sprint's 2 ms.

The fix was not a better heuristic. It was `MAX_BACKTRACKS = 40` plus raising
the sub-seed retry limit from 60 to 400: abandon an attempt the moment it has
had to unpick itself more than a few times, and start a fresh line. That took
generation to 5–13 ms per stage across every band, with zero failures over 300
seeds × 4 lengths.

The reason generalises: most of the cost in these searches is walking the same
ground twice, so many short attempts beat a few long ones whenever the whole
attempt is cheap to redo and a derived sub-seed keeps it deterministic.
Reach for the restart budget before reaching for a smarter draw.

Also worth knowing: a terminal check written as `if (total > ceiling) return
null` can be dead code when the per-draw cap already refuses to commit past
that ceiling. The search then has no way to give up at all.
