---
title: An overhead camera cannot be tilted forward without a WIDE fov — the geometry, not the aim point, is what pins it
date: 2026-08-27
scope: pwa/src/game/camera.ts
concepts: [camera, fov, framing, overhead]
---

A camera parked over the roof sits at `atan(height / dist)` below the
horizontal — 20 m up and 5 m back is ~76°. The frame has to hold the car at
roughly half its half-height, so the AXIS can only pitch back to
`76° − 0.5·halfVfov`. At a normal 50° fov that is ~60° down, whose top edge is
still 34° below the horizontal and reaches barely 30 m of road: it reads as a
map, and a map gives a driver no warning at all. Moving the aim point further
ahead does not fix it — it only walks the car off the bottom of the frame.

The lever is the FOV. Opening it to ~68° lets the same rig pitch back to ~57°
with the car still three quarters down the frame, and the top edge reaches
~45 m past the nose. Portrait makes this better rather than worse: hor+
(`verticalFovFor`) raises the vertical field, so the phone sees MORE road
ahead, and the 110° cap keeps it off the fisheye.

Sanity-check a new angle on paper before building it — `atan(height/dist)`,
minus half the half-fov, is the whole shot — then shoot it. Guessing a
distance and an aim point and looking costs a build and a capture per guess.
