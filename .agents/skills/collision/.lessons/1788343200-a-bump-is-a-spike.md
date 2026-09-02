---
title: A bump is a one-step spike into the springs — every velocity clamp between it and the body cancels it
date: 2026-09-02
scope: engine/game/ground.ts, engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [suspension, springs, bumps, kerbs, tuning-loop]
---

A kerb, a lattice crease or the shoulder's step reaches `stepSuspension` as
the wheels' vertical speed jumping for ONE step and dropping back the next
(`groundJolt`'s bump channel). Physically that is right: the relative speed
between body and wheels goes to `-h/dt` for a step and back to zero, and the
body ends up displaced by the step's height. It is also exactly the shape
every clamp destroys. `rateMax` at 3 m/s and a `bumpMax` of 2 m/s each
truncated the spike, and the take-back the next step was left standing at
its full size, so the pair summed to nothing and a 14 cm kerb at 90 km/h
moved the body by one centimetre — the read that made the car look bolted
to the road, with the bump channel present and "working".

The probe that shows it: drive a flat with a single step up 60 m ahead at
25 m/s and record `car.ride`'s deepest and highest values past the step
(`tests/ground_test.ts`, "a step in the ground squats the body"). Under two
centimetres of squat means a clamp ate it.

What bounds the body is the bump stops and the `heaveMax` clamp on `ride`,
never a cap on `rideRate`: with the stops in place `rateMax` is a guard
against a runaway integration and has to sit above the biggest spike a real
step puts in (fifteen-odd m/s). The SHAPE channel (the smoothed grade) keeps
its own `joltMax` cap, which is fine because a sustained jolt has no
take-back to cancel against.
