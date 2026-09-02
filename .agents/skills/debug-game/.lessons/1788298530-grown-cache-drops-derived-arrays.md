---
title: A search that returns a wrong answer over right data is the ACCELERATION STRUCTURE — and a cache grown in place drops whatever its rebuild loop does not rewrite
date: 2026-09-01
scope: engine/mapgen/flat.ts
concepts: [bug-classification, endless, caching, locate, determinism]
---

On an endless stage `locate` was returning a sample 40 indices from the true
nearest while `track.samples` held perfectly good coordinates. The data was
right; the bounding circles over it were not.

`flatTrack` grows its arrays as an endless road appends, copying the old
values across and rebuilding only from the sample the extension starts at.
The per-sample arrays were copied; the derived group circles were not — so
every circle behind the frontier stayed at the zero a fresh `Float64Array` is
allocated with. A circle of no radius standing at the world origin passes the
"too far to hold the answer" test for any car that is not at the origin, so
the walk skipped the whole of the road the run had already driven. The
endless bot drove 902 m instead of 2691 m and blamed itself with two
respawns.

Two things to carry:

- When a cache is EXTENDED rather than rebuilt, every derived array needs the
  same `.set(cached.…)` carry-over as the raw ones. The rebuild loop starting
  at the frontier is exactly what makes the omission silent.
- A pruning search whose bound is wrong fails by MISSING candidates, never by
  inventing them — so "the answer is further away than a brute-force scan
  says" points straight at the structure, not at the distance maths.

The bug was pre-existing and invisible because a car on an endless stage
stays near the frontier, where the circles happen to be fresh. Anything that
starts querying the road BEHIND the car will trip it.
