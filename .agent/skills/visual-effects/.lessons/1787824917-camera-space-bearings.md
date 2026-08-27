---
title: A screen-anchored direction marker must take its bearing in CAMERA space — an engine heading difference points it at the wrong side
date: 2026-08-27
scope: pwa/src/game/
concepts: [camera, hud, world-markers, conventions]
---

The rendered world MIRRORS the engine's map view: the car's right axis
(`cos h, -sin h`) lands on the LEFT of the screen. So a marker that shows
"which way is X" cannot compute `atan2(dx, dz) - cameraHeading` and use the
result as a screen angle — it comes out flipped, and the mistake looks
plausible in code and only shows up against a landmark in a screenshot.

Derive the bearing by rotating the world-space direction into camera space
instead, and the convention falls out by construction — `+x` is
screen-right, `-z` is straight ahead, no flip to remember:

```ts
camera.getWorldQuaternion(q);
dir.set(tx - car.x, 0, tz - car.z).applyQuaternion(q.invert());
const bearing = Math.atan2(dir.x, -dir.z);
```

The same pass taught the placement trick: an instrument that must hold a
fixed spot on screen goes under `camera` as a child (and the camera under
the scene, or its children never draw). Express the slot from the CURRENT
vertical fov — `halfHeight = dist * tan(fov/2)`, `y = halfHeight * (1 - 2 *
slot)` — and scale it by `halfHeight` too, so portrait and landscape (which
do not share an fov here) get the same instrument at the same size.

Finally: a pointer that lies flat in the ground plane collapses to its own
cross-section whenever it aims at or away from the camera — exactly the two
bearings that matter most. Spin it in the plane of the FRAME (up = ahead,
down = behind) with a shallow tilt into the screen for volume, and it is
readable at every bearing.
