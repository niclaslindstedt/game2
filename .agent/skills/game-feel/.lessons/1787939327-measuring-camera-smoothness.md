---
title: Measure a camera by driving the bot through it headlessly and metering SECOND differences — and know which columns cannot tell two rigs apart
date: 2026-08-28
scope: pwa/src/game/camera.ts, tests/camera_test.ts
concepts: [camera, game-feel, measurement, harness, testing]
---

A camera is measurable, and "does it feel smooth" does not need a playtest to
answer. `camera.ts` only ever READS `GameState`, so a probe can `step()` the
engine with `botInput` and call `cam.update(state, 1/60)` over it — no DOM, no
browser. The harness is in `tests/camera_test.ts`: `weave`/`straight` script
the drive, `jolt` takes the RMS second difference of a series, `spread` takes
its wander. Node runs `camera.ts` directly under
`--experimental-strip-types` if you register a resolve hook mapping `@engine`
(`camera-start.ts` imports `TUNING` as a value); three.js resolves only from
inside the repo tree, so the probe file has to live there.

**Second differences, not travel.** A pan of any speed has almost no second
difference; a shot that rocks is nothing else. Meter camera height relative to
the car, the view direction's pitch/yaw/roll, and the car's projected place on
screen.

**Which columns lie.** Asked why `chase` felt rockier than `close`, heave
jolt, pitch jolt and the car's on-screen wander all said the two rigs were
within 5% — because every chase rig AIMS at the car, so the car is pinned in
frame and those columns mostly read the terrain. The column that separated
them was the camera's LATERAL offset in the car's heading frame: 0.64 m RMS
against 0.40 m, i.e. how far the world sloshes sideways. Its driver is the
yaw-follow lag times the standoff, not the swing spring — zeroing `swing`
made it WORSE, while raising `followRate` was the only lever that moved it.
Report the tail (p99.9, max) beside the RMS: the rare violent events and the
continuous buzz are different problems with different fixes.
