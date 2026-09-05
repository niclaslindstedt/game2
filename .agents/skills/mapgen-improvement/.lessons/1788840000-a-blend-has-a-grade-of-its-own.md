---
title: A blend has a grade of its own — bound a run-out at its reach, never ease it toward the country
date: 2026-09-05
scope: engine/mapgen/terrain.ts
concepts: [terrain, r31, verge, embankment, spurs, measurement]
---

A fill's side falls at the verge grade and lands on the country by a
`max`; a cut's bench climbs back by a `min`. Both are slope-safe as they
stand. What was NOT was every ease laid over them: a smoothstep from the
line toward the far field releases 1.5 × (what it still holds) / (its
length) per metre ON TOP of the line's own grade — 0.4 m/m on a 30 m fill
over 110 m — and the corridor's ease from the mat edge onto the line did the
same with the level it was holding. Three climbable grades summed to 48°
(seed 9). The fix is never a longer ease: `letGo` is a BOUND, `far ±
(reach − d) · climbable`, which has no grade of its own and is exactly the
country at the reach, so there is no seam either; the corridor's ease
carries only the DIFFERENCE between the mat's edge and the sample's level.

Second half: a run-out has to LAND inside the reach or the bound is what
lands it, at `climbable`. A road standing over a hillside that falls as fast
as the fill does never lands at the verge grade (seed 10, 22 m over a 0.5
slope), so `fillGrade` is the hillside's own fall plus what closes the
height by the reach — read off the country under the centerline, cached
per sample. The same rule serves a branch's fill (`spurs.highest`), with the
country under the branch read once per query.

Measure it with `make analyze SEEDS=…` and the `ground.climb` row, then
`spot.mjs`-style rows across the flagged cell printing base, ceiling, the
nearest sample's elevation and distance, and the branch's — the 48° cell is
always two adjacent lattice corners handed different terms.
