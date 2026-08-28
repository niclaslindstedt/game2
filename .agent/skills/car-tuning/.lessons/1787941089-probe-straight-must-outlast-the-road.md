---
title: A flat-out probe that outruns its compiled road reads `natureTop`, not the car — every car converges at ~152 km/h
date: 2026-08-28
scope: tests/, engine/game/car.ts
concepts: [test-conventions, synthetic-tracks, surfaces, measurement, gearing]
---

A terminal-speed probe run past the end of its `compileTrack` straight leaves
the road, and `TUNING.surfaces.natureTop` (42 m/s) plus `natureOverDrag` claw
the car back to about 152 km/h whatever it is. Three cars with gear ceilings of
223, 205 and 259 km/h all read 152, and a gearbox change worth +6% reads as
+0.1%: it looks exactly like a drag-limited top end and it is a soft cap on a
surface the probe was never supposed to be on.

Sample the PEAK speed over the run rather than the final one, and check the
trace: a car that climbs to its gear ceiling and then falls back to ~152 is off
the road, not equilibrated. This is the same trap as the sideways probe leaving
a narrow road (`state.offRoad`), reached from the other end — the straight has
to outlast the run in LENGTH as well as in width.
