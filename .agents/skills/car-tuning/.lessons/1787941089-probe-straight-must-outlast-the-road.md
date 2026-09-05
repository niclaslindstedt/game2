---
title: A flat-out probe that outruns its compiled road is measuring the wild, and since the off-road cap went that now reads like a plausible answer
date: 2026-08-28
scope: tests/, engine/game/car.ts
concepts: [test-conventions, synthetic-tracks, surfaces, measurement, gearing]
---

A terminal-speed probe run past the end of its `compileTrack` straight leaves
the road. That used to be loud: `natureTop` clawed every car back to ~152 km/h,
so three cars with gear ceilings of 223, 205 and 259 all read 152 and a gearbox
change worth +6% read as +0.1%. The off-road cap is gone now and the failure is
QUIETER, which makes it worse — open country runs to within ~1% of the same
car's road top end, so the number that comes back looks right and is simply the
wrong surface: it misses the surface's drag difference, and anything measured
on the way UP is off by the whole of `natureDig`, which is 55% of the pull from
a standstill.

So assert the surface rather than eyeballing the speed: check `state.offRoad`
is false for a road probe (and true for a wild one) on every sampled step, and
still sample the PEAK over the run rather than the final value. This is the
same trap as the sideways probe leaving a narrow road, reached from the other
end — the straight has to outlast the run in LENGTH as well as in width.
