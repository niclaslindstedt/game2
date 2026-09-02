---
title: A flat sheet laid under a car cannot be kept out of the road — the car's shadow is a shadow map with the cars as its only casters and the ground as its only receivers
date: 2026-09-02
scope: pwa/src/game/car-shadow.ts, pwa/src/game/car-body.ts, pwa/src/game/environment.ts
concepts: [shadow, rendering, three, z-fighting, flicker, lighting]
---

A sheet planted at one height (the road's centreline sample, or the terrain
under the car's middle) and tilted by one attitude is a plane; the road under
it is a cambered, crowned, cresting surface a few centimetres off the engine's
analytic height. Wherever the two cross, the sheet dips under the mat and its
edge z-fights — a flickering, half-missing shadow — and no lift, polygon
offset or render order makes a plane lie on a curve.

The fix that actually holds is a real shadow map, and it is cheap HERE because
of how it is split (`car-shadow.ts`):

- **Casters are the cars only** — `castShadow` on the shell, glass, bolt-ons
  and wheels in `car-body.ts`, never the cabin, the lamp blooms (an additive
  quad casts a rectangle) or a ghost. A dozen bodies into a depth map is a
  pass the GPU barely notices.
- **Receivers are the ground only** — terrain tiles, road, skirts, markings,
  chippings, water. Only a receiving material pays the lookup, so the forest
  never sees the map.
- **Because no receiver is ever in the map, there is no acne and no bias to
  tune** — the shadow starts exactly at the tyres.
- **Snap the frame to texels** in the light's own plane, with the same basis
  three's `lookAt` builds (it nudges a vertical axis along z, not x), or a
  still car's edges crawl as the camera tows the frame along.
- **Place the sun RELATIVE to its target** everywhere the environment moves
  it; the shadows move the target to the framed car every frame, and a light
  set from the origin points somewhere else for a frame.
- Draw the map once a frame (`shadowMap.autoUpdate = false`, `needsUpdate`
  in `follow`): the mirror pass would otherwise redraw it.

Gate it on the beam's share (`sunHardness`, sky.ts), not the key light's
intensity: under a storm's deck the key is still lit and would throw a crisp
shadow from a sky that has none.
