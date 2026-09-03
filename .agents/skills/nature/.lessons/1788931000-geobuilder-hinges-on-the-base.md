---
title: A GeoBuilder part hinges on its OWN base — `baseY` is a lift after the turn, and anything off a leaning trunk hangs off `onTrunk`
date: 2026-08-26
scope: pwa/src/game/flora-build.ts, pwa/src/game/flora-species.ts, pwa/src/game/flora-desert.ts
concepts: [flora, geometry, transforms, hinge]
---

`GeoBuilder.add` composes scale, then rotation about the model origin, then
the lift `o.x/y/z`. `cone`, `cyl` and `blob` build their primitive standing
on the origin and pass `baseY` (or the blob's centre) as that lift, so a
tilted part pivots on the point it grows from. The alternative — baking the
height into the geometry and then tilting — pivots about the model's FOOT,
and at five metres up a third of a radian throws a bough two metres
sideways: that was the crooked pine's upper trunk beside its lower half,
the bog pine's fork, the oak's limbs, the cholla's joints and the yucca's
head, all hanging in the air beside the plant.

Three consequences for a recipe:

- Anything leaving a trunk that leans hinges at `onTrunk(lean, at)`, not at
  `(0, at)` — the axis of a trunk with `tiltZ: lean` is `-sin(lean)·at`
  across at height `cos(lean)·at`. A `limb(...)` takes that point and
  returns its far end for the foliage that goes there.
- `blob` still scales the icosahedron BEFORE adding it (`sy` squashes the
  shape, never the lift), so `sx/sy/sz` are stripped from the opts it
  forwards.
- Positive `tiltZ` leans a part's top toward −x; `limb`'s `tilt` leans
  toward +x before its `angle` swings it. The `swung` helper is the yaw
  applied by hand for any point another part has to find.

The one place a part is still turned about the origin on purpose is a
geometry added directly with `add` and its own translation — the fallen
trunks, the birch bands, the timber stack — and those are posed in geometry
space (`geo.rotateZ`, `geo.translate`) for the reason the lay-a-cylinder
lesson gives.
