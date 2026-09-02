---
title: An ease answers a kink with a kink — carry an outside camera's height on a spring, led by the SLACK's own velocity, never by car.vy
date: 2026-09-02
scope: pwa/src/game/camera.ts, pwa/src/game/camera-ground.ts, pwa/src/lib/sprung.ts
concepts: [camera, inertia, spring, ground-follow, off-road]
---

A first-order ease on the chase rig's height (`createFollow` at 9/s) is a
camera with no mass: its velocity steps in the frame the ground kinks, and off
the road — where the car rides a 14 m lattice whose every cell edge is a kink
— that is the camera pumping over every crease the car bobs over. "Too
responsive, especially up/down, off-road" is this.

The fix is `createSprung` (lib/sprung.ts): a critically damped mass at
~1.1 Hz on the ground, ~4 Hz in the air so a designed jump's arc is still
followed. Two traps on the way:

- **A spring trails a hill by `2ζv/ω`** — most of a metre at rally pace, and
  a metre low on every climb is a camera looking at a roof. Feed the known
  climb forward as `lead` and the spring only rejects the residual.
- **Do not feed `car.vy` as that lead.** The engine's smoothed grade still
  carries the road's crown and wheel tracks, and `2ζ/ω` of it is centimetres
  of camera on a dead-flat road — `tests/camera_test.ts` ("moves the car and
  not the camera") caught it at 0.027 m against a 0.02 bar. Lead with the
  velocity of the SLACK's own output instead: inside the play it does not
  move, so the lead is zero across every ripple and exactly `vy` on a hill.
  Snap it across a takeoff or landing, which are changes of movement, not
  bumps.

The lift on a descent, the duck on a climb and the aim's climb read the same
eased climb — applied raw, `climb * aimClimb` is metres of aim height per
unit of grade straight into `lookAt`, which is the pitch flickering.
