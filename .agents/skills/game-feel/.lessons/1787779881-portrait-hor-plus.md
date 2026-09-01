---
title: Portrait is an hor+ problem at both ends — a collapsed horizontal field, and the vertical field it is bought with landing half in the bonnet
date: 2026-08-27
scope: pwa/src/game/camera.ts
concepts: [camera, fov, portrait, steering, touch, hood]
---

three.js `PerspectiveCamera.fov` is VERTICAL, so a number that reads fine in
landscape collapses the horizontal field on a phone held upright (60° vfov ≈
100° across in landscape, ~30° in portrait). The same yaw rate then sweeps
~3× more frame width and every steer or drift LOOKS wildly amplified —
players report it as an INPUT bug ("the same cm of drag steers more"). The
touch wheel's px mapping is orientation-independent; do not touch it. The fix
is hor+ (`verticalFovFor`): below the reference aspect, hold the horizontal
field and raise the vertical fov, capped (~110°) before it fisheyes.

That raise has a second half nobody expects. Every extra degree lands half at
the top and half at the BOTTOM, which for any camera with the car's own
bodywork under its aim line is more paint: the hood cam framed to a third of
the frame in landscape took 40%+ of a 390×844 phone. The fix is not a
different mount — it is aiming UP by a share of the widening,
`(verticalFovFor(fov, aspect) - fov) / 2`, so the bodywork holds the same
ANGLE off the nose at every aspect. Giving back all of it turns the surplus
into pure sky, more than the rest of the game's portrait framing carries;
~0.6 of it trades some back for road.

Any camera framing change needs its own PORTRAIT screenshot. The landscape
shot cannot show either half of this, and the reference viewport is 390×844.
