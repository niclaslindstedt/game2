---
title: Cut the WORLD with per-material clippingPlanes — the renderer's global array clips the sky dome with it
date: 2026-08-27
scope: pwa/src/game/renderer.ts, pwa/src/game/environment.ts
concepts: [rendering, clipping, camera, map-view]
---

three.js gives no per-material opt-out from `renderer.clippingPlanes`: the
global array is applied to every material drawn, and `material.clippingPlanes`
only ADDS local planes on top. So cutting the stage down to a shape (the map
view's island, map-island.ts) with the global array also cuts the sky dome, the
sun and anything else camera-locked, and the background shows through wherever
the planes bite.

The pattern that works: `renderer.localClippingEnabled = true`, then hand ONE
array instance to the world's materials (`world.group.traverse`) and never
reassign it — mutate its LENGTH to switch the cut on and off, because a
material whose `clippingPlanes` array is empty clips nothing. Assigning the
same array again is free, so a re-traverse is how newly built geometry joins
the cut. Changing the plane COUNT re-keys the shader program, which three
caches, so the first toggle each way costs a compile and later ones do not.

Separately: the sky dome is a fixed-radius shell centred on the ground under
the camera. Any camera more than DOME_RADIUS up (the map view is kilometres up)
is OUTSIDE it and sees a ball hanging under the world — `setSky(false)` is why
the map view drops the dome, the stars, the sun, the clouds and the ridge rings
and hangs the stage on `scene.background` instead.
