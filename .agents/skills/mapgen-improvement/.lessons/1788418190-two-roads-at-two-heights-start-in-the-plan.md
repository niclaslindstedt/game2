---
title: A step across a junction arm is not a terrain bug until the two roads are where the plan says — check the borrowed run against the highway's line, and the highway against itself
date: 2026-09-03
scope: engine/mapgen/borrow.ts, engine/mapgen/highway.ts, engine/mapgen/compile.ts
concepts: [junctions, highways, borrow, measurement, seeds]
---

The lanes metric reported a 0.6 m step across a junction arm, forty metres
out, where the route's verge crossed the arm's mat 1.4 m higher. Every
terrain-side fix (a platform that reaches further, an overlap lift that
holds the route on the plane) moved the step a few centimetres, because
the two roads were not where the platform assumed: the route had left the
public road 13 m into the field beside it, and the arm cut from the road
set off SIDEWAYS across the route to get back to the line.

Before touching the ground under two roads, measure the roads:

- **Route vs the road it borrowed**: distance from every asphalt sample to
  the nearest highway point, entry to exit (`drift-probe` style). Over
  30 seeds on main it was 13–280 m. Two causes in `followRoad`, both in
  the plan: a chunk gentler than `straightRun.bend` was drawn as a STRAIGHT
  and its heading was simply dropped (a 4 km radius over 300 m is 5° and
  13 m), and a backward run NEGATED the road's heading difference, so
  every bend on such a run was walked the wrong way. The fix is in the
  vocabulary's terms: every bending chunk is a turn of the road's own
  radius, and what is straight is `straightPart`'s answer, read by R38,
  R4 and the co-driver alike.
- **The road vs itself**: closest approach between two points of one
  highway more than its own radius apart along it. `layOne` kept off every
  road already laid and never off its own line; a shore dodge turned it
  round and the two arms cut from it ran along each other 600 m out at
  two heights — the 35 m "bumps" the lanes probe found far from the route.
- **Probe both trees**: main had three folded roads over the same seeds
  and the same drift on every borrow, so the two are pre-existing classes
  the re-rolled fixtures exposed, and each is a small root-cause fix rather
  than a widened test.

Only once the roads agree with the plan is the overlap lift worth its
lines — with the roads right, seed 24's arm still stepped 0.39 m without
it and nothing with it.
