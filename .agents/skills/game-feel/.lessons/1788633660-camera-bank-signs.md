---
title: A bank into a right-hander is `rotateZ(-bank)` after `lookAt`, and the engine's slip runs NEGATIVE through a right-hand drift
date: 2026-09-05
scope: pwa/src/game/camera.ts, pwa/src/game/camera-feel.ts
concepts: [camera, bank, drift, signs, tilt]
---

Three sign facts every camera tilt has to get right, stated once so the
next pass does not rediscover them by flipping things until the picture
looks plausible (which the skill forbids — a camera sign is never flipped
to fix a perceived left/right issue):

- In the engine, heading grows toward the car's RIGHT (`right = (cos h, 0,
-sin h)`), so a positive `yawRate` is a right turn — CHASE_RIGS' swing
  already relies on it (`-yawRate · swing` moves the lens to the outside).
- Through a right-hand DRIFT the car is yawed further right than it is
  travelling, so its sideways speed `w` is to the LEFT and `car.slip`
  (`atan2(w, |u|)`) is NEGATIVE. A "lean into the slide" term therefore
  SUBTRACTS the slip.
- three.js's camera looks down its local −z, so a positive `rotateZ` tips
  the up vector to the camera's LEFT. Banking INTO a right-hander (up tipped
  right, the horizon's right end rising in frame, a rider's lean) is
  `camera.rotateZ(-bank)`, applied as a local turn AFTER `lookAt` — the aim
  point cannot express roll at all. `rotateX(+θ)` tips the shot BACK (nose
  up), which is the climb's sign.

The honest check is not a screenshot but the lens's right axis:
`(1,0,0).applyQuaternion(camera.quaternion).y` is negative when the frame is
banked into a right-hander (`bankOf` in `tests/camera_feel_test.ts`).
