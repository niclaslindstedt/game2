---
title: The compiler's Euler walk diverges from ideal arcs by METERS over a stage — land a road on a point by walking it the compiler's way
date: 2026-08-27
scope: engine/mapgen/circuit.ts, engine/mapgen/compile.ts
concepts: [geometry, compile, circuit, determinism]
---

Three walks exist over the same segment plan and none of them agree: the
search's probe (`probePoints`, 6 m steps), the compiler's sample walk
(`SAMPLE_STEP`, and `heading += k·step` BEFORE the move), and exact circle
geometry. `BOUND_SLACK` in `search.ts` exists because of the first two
diverging; over a whole stage it is meters.

R22's closure is solved with exact circle geometry, and solving it from the
PROBE cursor left the compiled road ending 2–6 m from its own start line —
which on a circuit is a hole in the road at the start/finish. The fix has two
halves, and both are needed:

1. Track a second cursor through the search that is walked exactly the way
   `compile.ts` walks (`buildWalk` in `circuit.ts`), and solve from that.
2. Fixed-point on the goal: solve, walk what that produced, move the goal by
   whatever the walk missed by, repeat. Converges in a couple of passes and
   closes to under 5 cm.

Headings need no correction — a segment's total turn is its curvature times
its length however finely it is stepped, so only position drifts. That is why
the correction is two numbers and not three.

Do NOT "fix" this by making the compiler integrate arcs analytically: it
would shift every existing seed's geometry, every campaign stage's character
and every sim digest, for a problem only the closure has.
