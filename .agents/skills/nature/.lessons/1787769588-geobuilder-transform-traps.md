---
title: GeoBuilder parts rotate/scale around their BASE — bake blob squash and offsets into the geometry before the lift
date: 2026-08-26
scope: pwa/src/game/flora.ts
concepts: [flora, geometry, transforms, instancing]
---

`GeoBuilder.add` composes T·R·S with the part's geometry already
translated so its base sits at the local origin: rotation (`ry`,
`tiltX/Z`) pivots the part around its base — right for leaning trunks and
splaying blades — but scale ALSO multiplies any y-offset baked into the
geometry. A blob lifted to y=6 with `sy:1.2` lands at 7.2 unless the
squash is applied to the icosahedron BEFORE the translate (which is why
`blob()` does exactly that and strips `s*` from the opts it forwards).
Same family of trap when capping a rotated cylinder (the fallen log): the
rotated part's far end is where the rotation put it, not where the
pre-rotation coordinates suggest — compute the end position after the
pivot, or skip the cap. Positive `tiltZ` moves the part's top toward -x
(`top = -sin(tiltZ) * h`).
