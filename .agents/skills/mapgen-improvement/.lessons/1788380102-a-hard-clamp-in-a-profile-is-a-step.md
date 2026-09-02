---
title: A profile walk needs the crest clamp as well as the grade cap, and a hard clamp that moves it by more than a step's grade is a wall — refuse the road
date: 2026-09-02
scope: engine/mapgen/spurs.ts, engine/mapgen/carparks.ts, engine/mapgen/homesteads.ts
concepts: [spurs, profile, crest, reject-never-repair, car-parks, homesteads]
---

Every minor road's height is one rule now, `followStep` in spurs.ts: the
follow toward a target, then the grade cap, then the crest clamp
(`elevation.follow.minorCrest`, three times the route's — a lane has to make
a pad's plane or a road's edge over a few dozen metres). A first-order
follower with only a grade cap leaves a brow wherever the target changes
mind: a grade that flips between two samples is a crest the car flies.

Three shapes of wall the walks left, and what each needs:

- **Arriving somewhere.** A lane or drive laid from the road and then eased
  onto a pad over the pad's 12 m blend puts the whole level difference in
  those 12 m (22%). Lay it to ARRIVE: settle the pad's level where the walk
  reaches the approach, within what the remaining run can make up at a
  road's grade (less the run the crest rule spends winding the grade on),
  and aim the profile at the plane from there. A drive's yard is only known
  at the end of its walk — walk the geometry first, lay the heights second.
- **Closing on a join.** `min(1, step/toJoin)` closes over a fixed window; a
  13 m height gap over 48 m is a wall at the last sample. Start closing at
  `|gap| / maxGrade` out, and REFUSE the road if the last step still exceeds
  the grade (`road:join-height`).
- **A band clamp.** R31's cone is AIMED at through `followStep` first
  (`min(ceiling, max(floor, want))`), and only clamped to as a last resort;
  a lane the clamp still moves by more than `maxGrade * step * 1.5` in one
  step has met a face, so return null (`road:band`) and let the search take
  another cell. And beside a junction the band is DEGENERATE — inside the
  stage's bench the cone has no swing, so floor stands over ceiling — which
  dropped every branch two metres at its first step and left a brow at the
  platform's rim on every seed: hold the junction's plane for
  `PLATFORM_HOLD` and do not ask the band there (drives do the same inside
  the bench).

And the last word on any lane is `gradesHold` after the pad's blend: reject,
never repair. The blend turns whatever is left into a ramp, and only a
measurement of the finished samples says whether that ramp is a road.
