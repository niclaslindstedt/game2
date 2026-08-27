---
title: A per-step keep-out query is the whole cost of compiling a stage — skip, ring, stride
date: 2026-08-27
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts
concepts: [spurs, performance, search, spatial-hash]
---

Giving the branch builder a "how far is the stage" query took compile time for
480 stages from 23 s to 89 s — the query was 59% of the profile, because each
of ~375 steps asks it for several look-ahead bearings. Four changes brought it
back to 33 s, in descending order of payoff:

1. **The answer is a PROMISE.** A distance of `d` means nothing can come inside
   the look-ahead for `(d − clearance − look) / step` steps, so a branch out in
   open country skips the query entirely. This only works if the query resolves
   FAR ENOUGH: capping the reach below `clearance + look` silently makes the
   promise a lie, and the branches walk straight back over the stage.
2. **Search the grid ring by ring, nearest first**, breaking once the nearest
   thing the next ring could hold is further than the best found. A plain
   `for dx / for dz` visits the far corner cells first, with nothing to bound
   them.
3. **Stride the road samples** (every 8th, 16 m apart) and subtract half the
   spacing off the answer — it can then only under-report, never claim room the
   branch does not have.
4. Numeric cell keys (`ix * 8192 + iz`), not template strings.

And the invariant belongs in a CUT after the walk, not in the walk: steering
away from the stage is best-effort, and a branch that dips inside the clearance
halfway along and comes out the far side has to end AT the dip. Trimming from
the tail leaves the incursion in the middle of the branch, where no test that
only looks at `samples[last]` will ever see it.
