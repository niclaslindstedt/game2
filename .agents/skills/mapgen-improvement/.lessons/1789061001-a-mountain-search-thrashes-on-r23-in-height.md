---
title: A search on a steep flank thrashes on R23-in-height, not on the fill cap — cap a mountain attempt's iterations to what a winner needs, and take the public roads off the flank
date: 2026-09-05
scope: engine/mapgen/generate.ts, engine/mapgen/highway.ts, engine/mapgen/search.ts
concepts: [search, performance, self-distance, r23, massif, alpine, seeds, measurement]
---

The alpine's first long and extra-long sweeps planned in 10–19 s a seed.
Instrumenting the draw loop (temporary `globalThis` counters, removed
after) said where: 22 sub-seed attempts, 18 of them dying at the iteration
cap, 31,000 three-segment retreats, 370,000 probes — a random walk in a
pocket with no exit. The ground query was NOT slower than the taiga's.

Three things that looked like the cause were not. Relaxing R34's fill and
cut caps made it SLOWER (more lines accepted, more pockets entered). The
land-reading steer and its downhill charge cost a fifth at most. What
dominated the refusals was `field.blocked` — R10/R23, in HEIGHT: two
traverses of a switchback stacked 20 m apart need `armSeparation` ≈ 70 m of
horizontal room, and on a 40 % flank 20 m lower is 50 m away. The second
was the public road: it contours the same flank the route needs and R23
keeps the gravel off it, a third of one slow seed's refusals, joined once in
a hundred solves.

What worked: every WINNING attempt closed inside 2,500 iterations while
every failing one burned the taiga's 6,000, so a mountain attempt is given
up on at 2,500 (`massif.iterations`) — restarting beats unpicking, as the
circuit found; and a massif country lays no public road at all
(`highwayCount` → 0), its tarmac being the pass itself sealed by height.
Long seeds went from 17 s to a few. The R23-in-height rule was left alone
on purpose: loosening it promises the terrain a face between stacked legs
that `cutClimb` only builds where the soil is thin and the road sealed.
