---
title: Anything drawn "on the horizon" is bounded by the camera's 900 m far plane, not by the weather — draw it near and size it to the ANGLE
date: 2026-09-08
scope: pwa/src/game/
concepts: [rendering, camera, weather, sky]
---

A sandstorm's wall was authored at the distance the real thing stands —
1,400 m out and 900 m tall — and was never drawn at all: `DRIVING_FAR` in
`camera.ts` is 900 m, and geometry past it is clipped silently. Nothing errors,
nothing warns; the object simply is not in any frame.

The sky's own shells dodge this by being fixed-size and drawn as a backdrop
(`sky-depth.ts`, `drawAsBackdrop`). Anything that has to be DEPTH-TESTED
against the world instead — so a ridge in front of it occludes its base, which
is the whole point of a wall of dust — has to live inside the far plane. Size
it to the ANGLE the real thing subtends rather than to its real dimensions:
400 m of curtain at 620 m out is the same 33° up as 900 m at 1,400, and it
still has room to come on across an approach without leaving the frustum.

The tell, if it happens again: the effect works in a unit test, the material
and the mesh are in the scene, `visible` is true, and no pixel changes.
