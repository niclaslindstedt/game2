---
title: A weight off the box's centreline makes every valley of the surface asymmetric — and a central difference at the kink reads that asymmetry as a slope
date: 2026-09-05
scope: engine/game/roll-hull.ts
concepts: [roll, geometry, gravity, physics, debugging, weight]
---

`seatSlopes` reads the centre-of-mass surface's gradient as a central
difference, and the surface's valleys — the faces a body rests on — are Vs
with a kink at the bottom, not bowls. Straddling the kink the difference
returns the MEAN of the two sides. With the weight at `[0, centreY, 0]` the
sides are mirror images and the mean is zero, so a body at rest on a face
felt nothing; the day the weight moved forward (`CarSpec.balance`) every V
became steeper toward the nose than the tail, the mean at the bottom became
`weight.along`, and a car lying flat on its four wheels was pitched at a
third of a g, for ever, by ground it was resting on. The crash-contact bench
caught it as 0.05 rad/s of pitch on a flat drop that must read zero to a
part in a thousand.

The fix is `kinked`: take the two one-sided differences, and where they
disagree in sign with the surface rising both ways, the body is IN the
valley and the gradient is nothing — it rests, which is what the face does
with the moment. A ridge (falling both ways) keeps the mean, because the
only question there is which side it falls to. For a symmetric weight this
is bit-identical to the old difference.

The general shape: any smoothed derivative of a min-of-corners surface hides
an assumption of symmetry at its kinks, and a change that breaks the
symmetry — a weight offset, a box that is not a box — turns the smoothing
into a force. Check by putting a body at rest on every face and reading the
rate it picks up with nothing else running.
