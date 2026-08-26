---
title: "Steering feels amplified in portrait" is the camera's aspect, not the input
date: 2026-08-26
scope: pwa/src/game/camera.ts
concepts: [camera, fov, portrait, steering, touch]
---

three.js `PerspectiveCamera.fov` is VERTICAL: a fixed number that reads
fine in landscape collapses the horizontal field on a portrait phone
(60° vfov ≈ 100° across in landscape, ~30° in portrait), so the same yaw
rate sweeps ~3× more frame width and every steer or drift LOOKS wildly
amplified — players report it as an input bug ("same cm of drag steers
more"). The touch wheel's px mapping is orientation-independent; do not
touch it. The fix is hor+ (`verticalFovFor` in camera.ts): below the
reference aspect hold the HORIZONTAL field and raise the vertical fov,
capped (~110°) before it fisheyes.
