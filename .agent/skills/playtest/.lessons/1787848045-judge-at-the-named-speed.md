---
title: Judge a wake effect at the speed the complaint names — at pace the car's own wake throws it out of frame
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/game/
concepts: [harness, scenes, particles, dust, camera]
---

Dust inherits a fraction of the car's backward wake, so the faster the car
goes the further behind it the cloud ends up. At 150 km/h a stage-time
scene catches a car that has already outrun its own plume: the frame shows
a handful of specks and says nothing about whether the cloud is too big.
A report about "too much dust" almost always comes from a SLOW frame,
because that is where the grains stay bunched around the wheels.

So stage the scene at the speed the report names, and hold the input that
makes the cloud rather than releasing it — a car crossing a field in a
straight line puts its tail off-camera, where the same car sideways on the
same ground puts it beside the body where a player sees it.

Also: `shot-drift` and `shot-speed` still reach their moment on
`waitForTimeout`, and under software rendering 4 s of wall clock is about
1.5 s of stage — both of them screenshot a car at ~55 km/h in second gear,
neither drifting nor at pace. Any NEW scene should use `atStageTime`, and
neither of those two should be trusted to judge a high-speed effect.
