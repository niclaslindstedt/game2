---
title: The corridor is a PLANE, not a height — anything the terrain measures off the road must carry its grade and its bank
date: 2026-08-27
scope: engine/mapgen/terrain.ts, engine/mapgen/road.ts, engine/game/track.ts
concepts: [road, terrain, bank, ground-follow, cross-section]
---

Everything in `corridorOffset(shape, lateral, width)` is symmetric in
`|lateral|` EXCEPT R19's bank, which is `-bank * lateral`. `terrain.ts` once
called it through `ribbonY` with `near.d` — the unsigned distance — so the
ground beside a banked corner tilted the same way on both sides and the
physics ground sat up to a metre off the drawn one (±1.06 m on seed 3).
`nearestSample` returns `lateral` beside `d`: use
`sideOf(lateral) * Math.min(d, cap)`, and `sideOf` must never return 0
(`Math.sign(0)` collapses the offset with the sign).

The same fact bites harder in R31's verge cone, which caps the ground off the
road's own underside. Take that cap as a HEIGHT per sample and two things go
wrong at once: a road descending a hillside drags a trench along beside
itself (the min over a bench of a sloping road is `bench × grade` below the
local value), and a banked corner's high side is cut to the height of its low
one — a metre of ditch along every fast turn. Give each sample a plane
instead (`slope·sin h − bank·cos h`, `slope·cos h + bank·sin h`, one dot
product per candidate) and both disappear: on a uniform grade every sample
agrees on the same answer, so the cap binds on nothing.

And take the min over EVERY sample in reach, not the nearest: at a hairpin
the two arms are a road's width apart and it is the lower one that says how
high the ground between them may stand.

Probe it rather than reading it: walk a compiled stage's banked samples and
diff `terrain.groundAt(x, z)` against
`s.elevation + corridorOffset(s, lateral, width)`. A mismatch that FLIPS SIGN
with the side is the bank; one that does not is geometry.
