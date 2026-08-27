---
title: hor+ opens a portrait frame downwards too, so any camera with bodywork under its aim fills a phone with paint
date: 2026-08-27
scope: pwa/src/game/camera.ts
concepts: [camera, fov, portrait, hood]
---

`verticalFovFor` holds the horizontal field on a narrow viewport by raising
the vertical fov (72° → up to 110°). Every extra degree lands half at the
top and half at the BOTTOM — which for a camera with the car's own bodywork
below its aim line is more bonnet. The hood cam framed to a third of the
frame in landscape took 40%+ of a 390×844 phone, and the fix is not a
different mount: it is aiming up by a share of the widening,
`(verticalFovFor(fov, aspect) - fov) / 2`, so the bodywork holds the same
ANGLE off the nose at every aspect. Giving back all of it turns the surplus
into pure sky (more than the rest of the game's portrait framing carries);
~0.6 of it trades some back for road.

Portrait needs its own screenshot for any camera framing change — the
landscape shot cannot show this, and the reference viewport is 390×844.
