---
title: The ground under an outside rig is a FLOOR read at the lens over a footprint, a CLIFF it declines to follow, and a SPRING led by the slack's own velocity
date: 2026-08-27
scope: pwa/src/game/camera.ts, pwa/src/game/camera-ground.ts, pwa/src/lib/sprung.ts
concepts: [camera, terrain, clipping, cliff, spring, ground-follow, off-road, jumps]
---

**The floor is read at the CAMERA's xz, water included.** Trailing a car
downhill puts `car.y + height` inside the slope behind it (4.3% of off-road
frames over ten seeds); no height above the CAR fixes it, and a lake is
opaque from underneath. But a bare `max(want, groundAt(here))`
is the shake players report on a cliff top: `groundAt` is not continuous (21
near-vertical steps up to 28 m on one stage), a shoreline swaps ground for
water, and on steep ground a lateral wobble is metres of vertical one. So: read over a FOOTPRINT (centre plus four corners), read it
BEFORE the impact shake is added, and let the floor rise at once but sink at
a bounded rate. Worst-case jerk went from 8–17 m a frame to under 1 m.

**A cliff is not a jump.** A rig that keeps 2 m over the roof for a 25 m
plunge makes the biggest thing on a stage read as nothing happening. Hold part of the
height and let the car sink down the frame, keyed to how far it has fallen
BELOW WHERE IT LEFT THE GROUND (`takeoff = car.y` while grounded) — never to
air time or `vy`, because every designed jump lands near its launch height,
so a deadzone and a share leave those framings alone. Wind on fast, off
slowly, or the landing is the camera dropping onto the car.

**Height on a spring, not an ease.** A first-order ease has no mass: its
velocity steps where the ground kinks, and off-road every lattice cell edge
is one. `createSprung` is a
critically damped mass (~1.1 Hz grounded, ~4 Hz airborne so a jump's arc is
still followed). A spring trails a hill by `2ζv/ω`, most of a metre at pace,
so feed the climb forward as `lead` — but NOT `car.vy`, whose smoothed grade
still carries the crown and wheel tracks (centimetres of camera on a flat
road). Lead with the velocity of the SLACK's own output: zero across every
ripple, exactly `vy` on a hill; snap it across a takeoff or landing.
