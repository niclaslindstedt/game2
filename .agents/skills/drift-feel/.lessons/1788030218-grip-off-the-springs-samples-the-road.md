---
title: A landing's grip loss cannot be read off `car.ride` — the road's cross-section moves the body further than a landing's rebound does
date: 2026-08-29
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [suspension, grip, lateral-grip, jumps, road-surface, verification]
---

"A landing should unstick the car" looks like it falls out of the springs:
land, rebound, tires go light, multiply `surfaceGrip` by something read off
`car.ride` / `car.rideRate`. Two measurements kill that.

**The rebound is tiny and it is the same size every time.** The squat clamps
at `heaveMax` (0.1 m, a bodywork number) and `damping` 0.45 gives an overshoot
ratio of ~0.21, so the droop out of ANY landing is ~0.02 m — measured across
lips 0.9–2.2 m at 16–44 m/s, every one squatted to -0.090 and rebounded to
+0.019. Driven off the springs the loss came to 9%, with no gradation at all.

**And what such a term actually samples is the ROAD.** R16's cross-section —
the crown, the ruts, the worn tracks — heaves the body 3–5 cm every time the
car crosses it, more than a landing's rebound. Coupled to grip it took ~20% of
the tires away in every steered corner on ordinary road (min load 0.69,
under 0.95 for a fifth of the corner): `make drift` gained 3–4° of slip on the
hard corners and five of its 120 rows ran off the road, none of it to do with
a jump. The same fact is why `joltMax` stays symmetric — uncapping the drop
side moves a crest's own travel by 0.000 m and only lets more cross-section
through.

The signal has to SAY "a landing": a decaying `CarState.settle` written at
touchdown from the slam. With that, the drift lab came back byte-identical to
main across all 120 rows.

Two verification notes. Measure the effect on the ANGLE the car keeps, not on
heading change — less grip is a slower redirect, so a landed car holds far
more slip while turning its nose no faster; a heading probe reads that as a
regression. And `make sim` cannot see any of this: it moved by 1 km/h while
the drift lab moved by a third of a g.
