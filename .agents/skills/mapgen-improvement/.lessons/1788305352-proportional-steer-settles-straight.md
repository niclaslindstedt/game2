---
title: A walk steered by a proportional pull plus a constant disturbance settles into a STRAIGHT line, not a wander
date: 2026-09-01
scope: engine/mapgen/highway.ts, engine/mapgen/river.ts
concepts: [road-network, search, terrain, plausibility, measurement]
---

`highway.ts` draws each public road as a wander plus a pull back toward the
point on the far rim it is aimed at. It was written as
`curvature = curvature * (1 - correction) + pull * correction`, and the effect
of feeding the curvature back into itself is that the bend the road drew for
itself decays: at `correction` 0.55 over an 8 m step it was gone three steps
after it was drawn. Measured over seeds 1-6, the median radius came out
between 1.1 and 29 km and three of the six roads ran arrow-straight for over
two kilometres — which is what a rally borrowing one of them got.

Two separate traps, and the second is the subtle one:

- **A decayed disturbance is no disturbance.** Hold the drawn bend until the
  next redraw and ADD the correction to it; do not blend the two.
- **A constant disturbance against a proportional pull has a steady-state
  error, and that state is a straight line.** Once the heading error grows
  until the pull exactly cancels the wander, the walk runs dead straight at
  an offset heading — forever, and it looks deliberate. Raising the pull only
  shrinks the offset. What breaks it is redrawing the disturbance often enough
  that the loop never settles (`HIGHWAY.bend` 260 m → 120 m) and drawing its
  magnitude from a band with its floor OFF ZERO, so "a bend" is always a bend.

Suspect this shape in anything that walks a line toward a goal. The tell is a
long dead-straight stretch in a walk that has randomness in it.
