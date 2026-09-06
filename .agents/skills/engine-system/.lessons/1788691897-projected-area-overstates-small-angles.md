---
title: Blending face areas by the plain direction cosine overstates drag at small angles — the cross-flow form is squared
date: 2026-09-06
scope: engine/game/aero.ts, engine/game/defs/tuning.ts
concepts: [aerodynamics, drag, physics, flight, jumps, attitude]
---

The projected area of a BOX along a direction is exactly
`A_x·|n_x| + A_y·|n_y| + A_z·|n_z|`, so that blend looks like the obviously
correct way to turn three face areas into one CdA. It is correct about the
area and wrong about the coefficient: a face a few degrees off the flow still
has the air attached to it and is nowhere near the bluff plate it becomes once
the flow separates.

It is not a rounding error, because the faces are not the same size. The car's
plan face is nine times its frontal one, so on the plain cosine a car flying
five degrees nose-up is charged nearly DOUBLE its end-on drag. That showed up
as `jump_test`'s "flight carries" bar (the landing must keep 0.9 of the
takeoff speed) failing at 87.5% on the one car with a wing, because the wing's
nose-up trim was being billed as if the car were falling flat.

Use the square of each direction cosine — the standard cross-flow form. The
three weights then sum to one, so the area is always a convex blend of the
three faces and can never exceed the biggest, which is worth asserting.

The general shape of the trap: whenever a model mixes quantities that differ
by an order of magnitude, the INTERPOLATION between them matters as much as
the endpoints, and a form that is exact for one physical quantity (area) may
be badly wrong for the one you are actually computing (force).
