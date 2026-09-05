---
title: The columns that pin the car in frame cannot tell two rigs apart — a rocky boom shows in the LATERAL offset in the car's heading frame
date: 2026-08-28
scope: pwa/src/game/camera.ts, tests/camera_test.ts
concepts: [camera, game-feel, measurement, harness, testing]
---

Asked why `chase` felt rockier than `close`, heave jolt, pitch jolt and the
car's on-screen wander all said the two rigs were within 5% — because every
chase rig AIMS at the car, so the car is pinned in frame and those columns
mostly read the terrain. The column that separated them was the camera's
LATERAL offset in the car's heading frame: 0.64 m RMS against 0.40 m, how far
the world sloshes sideways. Its driver is the yaw-follow lag times the
standoff, not the swing spring — zeroing `swing` made it WORSE, and raising
`followRate` was the only lever that moved it (which is why `close` and
`chase` now carry identical steadying numbers).

Report the tail (p99.9, max) beside the RMS: the rare violent event and the
continuous buzz are different problems with different fixes.
