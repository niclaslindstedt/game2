---
title: A fastback's backlight is the cabin's tail patch, and its quarter glass wants `quarterZ` — the two things a measured three-door hits that the hatch did not
date: 2026-09-05
scope: pwa/src/game/car-styles.ts
concepts: [proportions, reference, measurement, fastback, greenhouse, car-design]
---

Measuring a car off photographs is the `car-creation` skill's pass (the
ruled crop, the compression rule, the overlay). What a three-door FASTBACK
adds to it:

- `cabin.baseRearZ` is the BACKLIGHT'S FOOT and `roofRearZ` is where the
  roof's SHEET ends — on a fastback that is where the quarter glass's
  diagonal begins, AHEAD of the rear axle: the light strip that looks like
  roof carried back over a "sail panel" is the C-pillar's top edge seen
  from a low camera, and the backlight runs from the roof's end as one
  shallow pane (some twenty-five degrees, a metre of run); carried back,
  the roof makes it a steep box under the wing. The wing's posts
  (`spoiler.kind: "gate"`) stand on that glass; the quarter edge's top
  corner cannot pass the roof corner, so `quarterRake` reaches at most to
  it, and the pillar is what is left of the patch's rear edge.
- The quarter glass is a TRAPEZOID WITH A ROUND REAR CORNER, not a
  rectangle and not a point: read all four of its corners. Its chord's
  foot goes in metres (`pillars.quarterZ`), its top `quarterRake` ahead of
  that, and `quarterCornerY` is where the diagonal turns down to the sill
  — the greenhouse paints the cut-off tip back in. Read only the foot and
  the glass comes out square; run the chord to the sill and it ends in a
  needle. A B-pillar likewise leans at a fixed `split`; state it as
  `splitZ`.
- The roof NARROWS and FALLS toward the tail (`cabin.roofRearHalf`,
  `cabin.roofRearY`); one roof width and height puts the rear corners a
  hand too far out and up, and only the fitted rear photograph shows it.
- A rim of 0.86 of the tyre is modern; a period one is 0.65.
- Race stripes are two groups: the bonnet's on the deck, the roof's with
  `on: "roof"`; the windscreen stays clear between them.

Two bars in `tests/car_geometry_test.ts`: the nose cannot go under 0.84 m
(`SOLID_PROP_HEIGHT` sits between 45% and 60% of the lowest bonnet — lift
the cap, keep the cowl and belt honest), and the bumper faces stop at
`TUNING.collision.halfLength`.
