---
title: A geology change re-rolls every stage, and a dozen seed-pinned tests then meet latent defects — triage each against main's own seeds before touching it
date: 2026-09-03
scope: engine/mapgen/geology.ts, tests/
concepts: [seeds, test-conventions, measurement, junctions, terrain]
---

Changing the country under the search (the crest shape, a rim width) is not
a change to one stage: every seed becomes a different stage, and every test
that pins a seed for a property is now asking that property of a stage it
never saw. On the whaleback pass eleven tests went red across ten files, and
not one was about crests.

Triage each one the same way, with a scratch probe rather than the test:

- **Run the identical probe on a worktree of main's head** (`git worktree
add … origin/main`, symlink `node_modules`). A defect with the same
  signature on main's own seeds is pre-existing; only a class absent from
  main is yours. Take the head this branch is rebased on — a worktree of
  `main~1` compared a field model that a merged PR had already changed.
- **A fixture seed is re-picked, never bent.** `crossing_test`'s CROSSINGS,
  `rivals_test`/`trace_test`'s short seed 40: search the sweep for a stage
  with the property (a crossing; a field that gets home on easy AND hard)
  and pin that, keeping the comment that says how it was found.
- **A latent defect the population now hits is still fixed at its root**,
  contained: a rail crossing recorded at the nearest rail POINT instead of
  the line (`noteRailCrossing`), a cut arm ending under a lake with no wet
  trim, a village placing its shops by a count the street never reached.
- **A tolerance bar set from one measurement is re-measured, not widened**:
  the asphalt share over eight long stages is decided by which two seeds
  reach a road, and both trees' numbers go in the comment.

The one that WAS the terrain's: the R31 ceiling at a junction mouth. Two
traps, both in `shapeAt` — a floor put on the ceiling before a later cone
takes the min again is no floor (every cone first, then every floor), and
`near.own` is the corridor's outer VERGE, a metre under a flared mouth's
mat; inside the lip the route's own shelf is the floor. `verge-probe`-style:
walk `locate().elevation` against `groundAt` at the verge line and sort by
the gap — the worst were all within a junction's reach.
