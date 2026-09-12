---
title: A ground decal that must sit IN the world is a Lambert with a grafted term, never a Basic with a tint — and the graft point for a bump is `normal_fragment_begin`
date: 2026-09-12
scope: pwa/src/game/snow-shader.ts, pwa/src/game/snow-marks.ts, pwa/src/game/snow-mantle.ts
concepts: [shaders, lighting, decals, on-before-compile, three-js, normals]
---

`MeshBasicMaterial` + `material.color = environment.someTint()` is the right
answer for a PARTICLE — it is fullbright, it is meant to be, and one
multiply is all the time-of-day it needs. It is the wrong answer for
anything lying ON the ground pretending to be that ground. A flat tint
cannot tell the sunlit side of a rut from the shaded one, so the decal reads
as paint at dusk and as a lamp at night however carefully the tint is
chosen. If the surface under it is Lambert, the decal must be Lambert too:
it then gets the lights, the shadows and `height-fog.ts`'s graft for free,
which is also why you never assemble the material by hand.

Two mechanics make the graft work in three.js:

* To BUMP the surface — a tread, a ripple, a grain — inject after
  `#include <normal_fragment_begin>`. That is where three declares
  `vec3 normal` as a local, and it is BEFORE `lights_lambert_fragment`, so
  a perturbation there is lit by the real sun and takes the real shadows.
  `diffuseColor` is already in scope there too (vertex colors included), so
  the same block can darken and set alpha.
* Anything computed AFTER the lighting has resolved (a wrap term, a
  glitter) goes in `#include <fog_fragment>`'s place, and must read
  `normal`, not `vNormal` — otherwise it shades the bump out of existence.

Traps: `tangent` is a name three claims for its own normal-map frame, so
name a custom attribute something else (`bandAxis`). And every number
interpolated into GLSL needs `.toFixed(n)` — a constant that happens to
round to a whole number prints as an int literal and `float * int` is a
compile error that only appears on some retunes.

When two surfaces are supposed to be the same material (a coat of snow and
the ruts in it), put the shared terms in ONE module both graft from. Two
copies is two snows the day one of them is retuned.
