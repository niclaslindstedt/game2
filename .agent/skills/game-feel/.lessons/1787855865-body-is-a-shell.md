---
title: The car body is a shell with no interior, so a viewpoint inside the cabin is not an option
date: 2026-08-27
scope: pwa/src/game/camera.ts, pwa/src/game/car/, pwa/src/game/car-styles.ts
concepts: [camera, car-body, hood]
---

The generated body is fullbright `MeshBasicMaterial` with default front-side
culling and nothing modelled inside it. Put a camera where a driver's eyes
really are and three things follow: the cabin shell vanishes (no pillars, no
roof, no dash), the windscreen glass and the cowl DO draw and eat the bottom
of the picture, and any ray steeper than the cowl passes under the bonnet
and out through a floor that is not drawn — the landscape shows through the
car. Screenshots of a mid-cabin mount looked good in landscape and fell
apart in portrait, where the frame tips much further down.

An in-car camera therefore mounts just AHEAD of the windscreen base and
clear above the bonnet line (`hoodEyeFor` in car-styles.ts, derived from the
car's own profile stations), where every downward ray lands on bodywork. It
still reads as a seat as long as the eye is offset off the centreline and
carries a driver's inertia.
