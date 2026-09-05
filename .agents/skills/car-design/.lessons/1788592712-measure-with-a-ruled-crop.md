---
title: A fastback's backlight is the cabin's tail patch, and its quarter glass wants `quarterZ` — the two things a measured three-door hits that the hatch did not
date: 2026-09-05
scope: pwa/src/game/car-styles.ts
concepts: [proportions, reference, measurement, fastback, greenhouse, car-design]
---

Measuring a car off photographs is the `car-creation` skill's pass (the
ruled crop, the compression rule, the overlay). What a three-door FASTBACK
adds to it:

- `cabin.baseRearZ` is the BACKLIGHT'S FOOT, so a big raked rear glass is
  the tail patch itself; put the wing's posts on the deck just ahead of it
  (`spoiler.kind: "gate"`) and the profile drops from there to the lamps.
- The quarter glass's rear edge goes in metres (`pillars.quarterZ`) so it
  stands plumb; what is left of the flank behind it is the sail-panel
  wedge, wide at the deck and a hand at the roof — which is the C-pillar
  of such a car, not a post. A B-pillar likewise leans at a fixed `split`;
  state it as `splitZ`.
- The roof NARROWS toward the tail (`cabin.roofRearHalf`); a single roof
  width puts the rear corners a hand too far out, and only the fitted rear
  photograph shows it.
- A rim of 0.86 of the tyre is a modern wheel; a period one is 0.65, and
  a woven mesh is `wheelStyle: "lattice"`.

Two bars a faithful measurement runs into, both held by
`tests/car_geometry_test.ts`: the nose cannot go under 0.84 m
(`SOLID_PROP_HEIGHT` must sit between 45% and 60% of the lowest bonnet —
lift the cap to the bar, keep the cowl and the belt honest), and the
bumper faces stop at `TUNING.collision.halfLength`.
