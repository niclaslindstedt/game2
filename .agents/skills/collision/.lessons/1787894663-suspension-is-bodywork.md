---
title: The suspension's travel is a BODYWORK measurement, and a soft spring cannot hold a body against this game's terrain
date: 2026-08-28
scope: engine/game/car.ts, engine/game/defs/tuning.ts, pwa/src/game/car-styles.ts
concepts: [suspension, springs, car-design, tuning-loop]
---

The renderer draws the whole sprung mass at `car.ride` with the wheels left on
the ground, so `heaveMax` is bounded by the gap between arch and tire —
`arches.radius - wheelRadius`, which is 0.08–0.11 m across the roster. It was
set to 0.30 m, roughly three times what any arch can hide, and the body
visibly slid off its own wheels. `tests/car_geometry_test.ts` now holds the
two together, the same way it already held the collision box to the shell.

The reason it reached the limit is worth keeping: the base-excitation model
(`rideRate -= Δvy × absorb`) is correct physics, and that is exactly the
problem. A valley floor at 35 m/s is ~3.5 g held for a fifth of a second, and
a 1.35 Hz spring needs `a/ω²` = 0.4 m of travel to resist it. Stiffening
enough to fix that by itself (≈3.9 Hz) would delete the landing squat. The
lever that works is a cap on the ground-follow jolt (`joltMax`, m/s²) — past
it the dampers are out of authority and the car rides the ground up, which is
what a bottomed suspension does. Cap ONLY the ground-follow call site;
landings and impacts are velocity steps and must stay uncapped.

Bucket the probe by situation before tuning: `road/cruise` was reaching 0.257 m
while the drift buckets sat near 0.02, so "it bumps when drifting" was really
"it bumps wherever the road pitches", most visible mid-slide.
