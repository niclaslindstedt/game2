---
title: A chase camera placed off car.y alone is under the terrain ~4% of off-road frames — floor it at its OWN xz, water included
date: 2026-08-27
scope: pwa/src/game/camera.ts
concepts: [camera, terrain, clipping]
---

The chase camera trails the car, so on a descent the ground BEHIND is higher
than the ground under the wheels and `car.y + height` puts the camera inside
the hill. Replaying the camera placement in Node against the real terrain over
ten seeds: 4.3% of off-road frames had the camera under the surface, worst case
4.35 m deep. No amount of height above the CAR fixes it — the floor has to be
read at the camera's own position.

`state.terrain.waterAt(x, z)` belongs in that floor beside `groundAt`. A lake
surface is opaque from underneath, so a camera that drops below one fills half
the frame with flat blue and a tilted shoreline — the failure players screenshot
and describe as the world glitching, distinct from the ground case.

Worth pairing with a gradient term (rise on a descent, duck on a climb): it
makes the drop read as falling AND keeps the camera clear of the slope it just
came over, so the hard floor fires rarely instead of constantly.
