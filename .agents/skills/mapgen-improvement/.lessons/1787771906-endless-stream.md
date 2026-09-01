---
title: The endless stream stays alive on two mechanisms — a drifting course and a commit lag
date: 2026-08-26
scope: engine/mapgen/generate.ts, engine/mapgen/compile.ts
concepts: [endless, streaming, course, backtracking, determinism]
---

An unbounded random walk with a sliding R10 tail window WILL box itself in
(observed within 2–3 km on many seeds). Neither forced alternating turns nor
a course pull alone fixes it: with a course, one deadlock remains — during
correction the loop forced kind=turn, and the R5 flip inverted the forced
direction into a candidate that always failed the course check; straights
must stay in the draw mix because they reset the run. The design that holds:
(1) a course bearing that random-walks slowly, road heading confined to
±maxCourseError with turn EXITS validated (a turn's heading is monotonic,
so endpoints cover the arc); (2) `commitLag` — the search runs ~900 m ahead
of what `extendTo` returns, and only pre-freeze plans are final, so the
stream can backtrack out of pockets like the finite search. Freeze by
`plan.start < highWater - commitLag` (start, not end — else delivery can
stall one segment short of the request forever), with highWater a
never-rewound high-water mark so output is chunk-invariant. Sweep 200 seeds
× 12 km before trusting any change here.
