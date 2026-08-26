---
title: The place/backtrack search can livelock — bound it, and sweep hundreds of seeds after any rules change
date: 2026-08-26
scope: engine/mapgen/generate.ts, engine/mapgen/rules.ts
concepts: [search, backtracking, seeds, livelock]
---

Widening the vocabulary (longer straights, bigger radii, longer stages)
made tryGenerateStage livelock on seed 39: the search got boxed in below
minStageLength and place-one/pop-one random-walked forever at 100% CPU.
The escape hatch is the iteration cap in the while loop (return null →
sub-seed retry); if you touch the search loop, keep it. Two related traps
fixed the same day: backtracking must RECOMPUTE the same-direction run
from the committed plans (resetting it to zero let a third same-direction
turn through R5), and the 6 m probe walk diverges from the 2 m compile
walk cumulatively, so bounds are validated against worldBound minus
BOUND_SLACK. The mapgen test's seed spread (i*37+1) misses plenty —
after any rules.ts change, sweep a few hundred sequential seeds through
compileTrack in a scratch script and watch wall time, bounds, and the
length band before trusting the tests.
