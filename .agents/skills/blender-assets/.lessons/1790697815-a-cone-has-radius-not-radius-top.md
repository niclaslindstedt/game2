---
title: three's ConeGeometry remembers `radius`, not `radiusTop` — a size read as `radiusTop ?? radius` turns every traced cone into a cylinder
date: 2026-09-29
scope: pwa/src/game/flora-build.ts, scripts/blender/prop.py
concepts: [three, trace, primitives, parameters]
---

`CylinderGeometry.parameters` carries `radiusTop` and `radiusBottom`;
`ConeGeometry.parameters` carries `radius` (the base) and `height`, and no
top radius at all. `pristineFrame` rebuilds the pristine copy correctly
(`radiusTop ?? 0`), but its `size` was written `radiusTop ?? radius`, so
a cone's traced size said "a cylinder as wide at the top as the bottom" —
a cow's horns and a road cone came out as tubes, and the cone's base plate
was drawn to a top radius that did not exist. The ring-based `r0`/`r1`
(off the geometry's own vertices) were right all along; `size` is what a
builder that rebuilds in the pristine frame reads. When a form looks
inexplicably fat, print the part's `type` and `size` before touching the
form.
