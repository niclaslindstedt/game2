---
title: A thing seen from far outside the road chunk that placed it gets its own manager — and an instanced mesh with a huge swept part needs `frustumCulled = false`
date: 2026-09-02
scope: pwa/src/game/world.ts, pwa/src/game/wind-farm.ts, pwa/src/game/carpark.ts
concepts: [rendering, instancing, culling, renderer-seam, placement]
---

`world.ts` has two ways to attach what the engine placed. Inside a road
chunk (`buildChunk` — homesteads, towns, solar farms): built with the road,
culled and disposed with it, visible only while the camera is within
`fogFar + SCENERY_REACH` of THAT chunk's trace. In its own list keyed by
`atS` (the car parks' `parkGroups`, the wind farms' `createWindFarms`):
added to `group` directly, pruned by `atS` on the endless prune, never
chunk-culled.

A two-hundred-metre turbine is the second kind: it is in view from a
kilometre of road that belongs to other chunks, and the chunk that placed
it goes dark long before it leaves the fog. Anything that also has to
ANIMATE (rotors, a herd) wants the manager anyway — `world.update` ticks
it, with a `LIVE_RANGE` early-out.

The trap inside it: three.js frustum-culls an `InstancedMesh` on its
GEOMETRY's bounding sphere at the origin, not on where the instances are.
A rotor instanced at a hub 120 m up, 70 m across, was culled the moment the
hub left the view while the blades were still on screen. Set
`frustumCulled = false` on any instanced mesh whose instances stand far
from the origin or sweep far past their own centre; the fog does the rest.
