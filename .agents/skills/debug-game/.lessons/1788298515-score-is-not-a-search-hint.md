---
title: A monotonic SCORE must never double as a spatial search hint — the two come apart the moment the car doubles back
date: 2026-09-01
scope: engine/game/
concepts: [bug-classification, locate, progress, state-design]
---

`state.progressIndex` is how far the run has GOT: it only creeps forward, so
a car that leaves the road and comes back leaves it standing hundreds of
metres up the stage. It was also the hint every `locate` started its
sixty-sample window from — and a window given a stale hint does not report
that it missed, it returns whichever sample it was cornered into. Because
`lateral` measures only ACROSS that sample's piece of road, a car merely IN
LINE with distant road came back as standing ON it, at its elevation.

The shape of the bug is worth recognising on its own: **a value that is
allowed to be wrong for scoring reasons cannot be the seed of a search whose
answer must be right.** The fix is two fields — `progressIndex` for the score
and `nearIndex` for where the car actually is — plus a search whose answer
does not depend on the hint at all (the window becomes an optimization that
seeds a bound, with a whole-road walk behind it).

The tell in a repro: log the located index every step while driving somewhere
awkward. A correct one moves by a sample or two at a time; a broken one jumps
tens of samples between consecutive 1/120 s steps.
