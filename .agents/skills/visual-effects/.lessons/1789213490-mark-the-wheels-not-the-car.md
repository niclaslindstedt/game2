---
title: A mark a car leaves is FOUR wheels, not one section swept along the car — anything else is only right while the car goes where it points
date: 2026-09-12
scope: pwa/src/game/snow-marks.ts, pwa/src/game/car-fx.ts
concepts: [marks, decals, ribbons, drift, slip, tread, geometry]
---

The cheap way to draw what a car leaves behind is a cross-section swept
along its centre: one strip, one width, ruts at fixed offsets. It is a
trap, and it is only correct in the one case a rally game spends the least
time in — the car going where it is pointing. Yawed, it is wrong three ways
at once, and every one of them is visible:

* The fronts and rears stop sharing a line. Straight, a rear wheel runs in
  its own front's track and the car leaves TWO; sideways the four sweep
  four paths and leave FOUR. A swept section can only ever draw two.
* The mark gets WIDER THAN THE CAR. A contact patch is a rectangle; dragged
  at an angle it sweeps that rectangle projected across the direction it is
  actually going, so `width*|cos B| + length*|sin B|` — a tyre rolling true
  prints its width, one fully sideways prints its LENGTH. Fixed offsets
  cannot say this.
* The tread stops printing. A rolling tyre stamps; a sliding one polishes.

Lay one ribbon per wheel at that wheel's own position instead, each with its
across-axis taken from THAT WHEEL's travel (difference its last position —
do not use the car's heading), and all three fall out of the geometry for
free. Two more things follow from the per-wheel frame and are worth having:
the steered fronts are measured against where they POINT (`heading + steer *
WHEEL_STEER_LOCK`), so a counter-steered drift draws fronts that cut and
rears that scrub; and the stamp is due when the BUSIEST wheel has moved a
spacing, not the car's middle, or a car spinning on the spot writes nothing.

Cost check before doing it: it is one lane per wheel plus one per body
feature, so drop the stations per lane and the ring length to keep the
vertex count where it was. Six stations per tyre and 280 stamps came out
about even with twelve stations and 420.
