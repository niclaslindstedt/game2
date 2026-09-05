---
title: The fov is VERTICAL, so portrait and overhead framing are both fov problems — hor+ with an aim-up share, and a wide lens before a steep tilt
date: 2026-08-27
scope: pwa/src/game/camera.ts, pwa/src/game/camera-eye.ts, pwa/src/lib/fov.ts
concepts: [camera, fov, portrait, framing, overhead]
---

three.js `PerspectiveCamera.fov` is VERTICAL. A number that reads fine in
landscape collapses the horizontal field on a phone held upright (60° is
~100° across in landscape and ~30° in portrait), so the same yaw rate sweeps
three times the frame and every steer LOOKS amplified — players report it as
an input bug. The touch wheel's px mapping is orientation-independent; leave
it. The fix is hor+ (`verticalFovFor`): below the reference aspect, hold the
horizontal field and raise the vertical, capped at `MAX_VFOV` before it
fisheyes.

The raise has a second half. Every extra degree lands half at the BOTTOM,
which for a lens with bodywork under its aim line is more paint: the hood
view took 40%+ of a 390×844 frame. Aim UP by a share of the widening
(`wideAim` in `EYE_RIGS`, about 0.6 of `(verticalFovFor(fov, aspect) −
fov) / 2`) so the bodywork holds the same ANGLE off the nose at every aspect;
giving back all of it is pure sky.

The overhead rig is the same lever the other way. A lens `atan(height /
dist)` below the horizontal (~76° for `top`) can only pitch back to that
minus half the half-fov while still holding the car three quarters down the
frame; at a 50° lens the top edge reaches barely 30 m of road and the shot
is a map, which warns a driver of nothing. Moving the aim point ahead only
walks the car off the bottom. Open the fov (~68°) and the same rig pitches
back to ~57° and reaches ~45 m. Sanity-check any new angle on paper first —
`atan(height/dist)` minus half the half-fov is the whole shot — before
paying a build and a capture per guess.
