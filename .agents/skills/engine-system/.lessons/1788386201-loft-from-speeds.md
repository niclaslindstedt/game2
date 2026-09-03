---
title: A lofted-body takeoff is grown from SPEEDS against the four-wheel foot, and the body may never arrive slower-falling than the foot has been
date: 2026-09-02
scope: engine/game/car.ts, engine/game/ground.ts, engine/game/defs/tuning.ts
concepts: [jumps, takeoff, crest, hop, physics, terrain]
---

The takeoff that finally worked: the body falls at `air.hold` of gravity from
the vertical speed it had, the ground is a one-sided constraint, and the gap
between body and wheels is `car.loft` (light under `air.loft`, skipping to
`air.leave`, flying past it). What did NOT work first:

- **Curvature-only rules** cannot see a lattice crease, a crown, or a
  kink between two samples. Compare the body with the RAW ground.
- **Comparing heights** lofts the car off every seat lift (the attitude
  settling onto a hillside moves the seat). Grow the gap from speeds.
- **The centre wheel** lofts a car crossing a road at a crawl; use the mean
  of four (`Seat.foot`), with a slope-free hanging-wheel clamp, and store
  the foot as an offset from the centre so placement cannot break it.
- **Smallest-magnitude of grade/centre/foot** alone resets the body to the
  slowest fall every step; sliding sideways across a wide banked S-bend
  the smoothed grade under-reads the descent by ~2 m/s and the car lifted
  off nothing at 100 km/h and spun on landing. Cap the arrival from below
  by the foot's speed read over `air.footLag` (`car.footMean`).
- **Classifying hop vs jump by the loft rate** misfires on a sharp kink;
  use the body's own speed (`hopRate`) AND whether the flight's gravity
  would have held the brow (`roadPull < gravity`).

Flagged lips launch on their own rule (`ctx.lip`, `edgeSpeed` drop under the
middle, `launchKeep`); a road-edge step of 11 cm must never be a launch —
the kink rule that did that was removed, and the roll/yaw trip kick only
fires on a `sudden` launch.
