---
title: A hit belongs to the CAR — an outside camera that rattles with it hides the one thing worth watching
date: 2026-09-01
scope: pwa/src/game/camera.ts, pwa/src/game/camera-shake.ts
concepts: [camera, shake, collision, game-feel, aliasing]
---

"The camera is too shaky" is nearly always two separate faults, and only one
of them is the amplitude.

The first is WHOSE motion it is. The engine already drops the body onto its
springs at every contact (`loadSprings` in `engine/game/collision.ts` sets
`rideRate` and `pitchLoad`, a kerb adds roll) and `car-mesh.ts` draws all of
it — so from an outside rig the car rocking IS the hit. A lens on a boom five
metres back is attached to none of that, and moving it with the car both
doubles the motion and hides the car doing it. So a blow is classed by CAUSE
(`ShakeSource` in `camera-shake.ts`): an outside rig takes zero of a
`contact`, and the in-car rigs take all of it, because in there a head that
keeps going when the car stops is the only thing in frame that says anything
was struck.

The second is the SHAPE. The old rattle was `(Math.random() - 0.5) * shake`
per frame, which at the amplitude a real blow deserves is ±0.4 m of white
noise: not a rougher shot, a broken one, and at 30 fps it aliases into a slow
lurch unrelated to the impact. The fix is the same one GRAIN (camera-eye.ts)
and SHAKE (car-shake.ts) already use — a few incommensurate oscillators under
8 Hz with a decaying envelope, phase redrawn per blow.

Two things that look like the problem and are not: the `heave` share (the
camera riding `car.ride`) is under 5 cm and cannot be low-passed apart from a
landing, since a contact drives the same 1.9 Hz spring; and a still
screenshot cannot review any of this. The reviewable measurement is a parked
car on flat ground, kicked, with the lens displacement from its settled datum
metered over the next two seconds (`blowRun` in `tests/camera_test.ts`).
