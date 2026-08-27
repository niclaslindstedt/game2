---
title: World lighting is Lambert + real lights; baked-color surfaces (car, particles) take the light as a material.color tint
date: 2026-08-26
scope: pwa/src/game/environment.ts, pwa/src/game/renderer.ts
concepts: [lighting, time-of-day, tint, materials, lamps]
---

The environment module lights the world with a hemisphere + directional
pair over MeshLambertMaterial, but the car keeps its BAKED vertex-color
shading (car-body.ts) on MeshBasicMaterial, and every Points system is
fullbright too. Those surfaces follow the time of day through one path:
`environment.carTint()` copied into `material.color` (which multiplies
vertex colors) — see `applyTint()` in renderer.ts. A new effect or mesh
that carries its own colors must join that tint path or it will glow
paper-white at night; a new lit mesh must be Lambert/Phong with normals
(`computeVertexNormals()` on hand-built BufferGeometries) or it renders
black.

There is a THIRD kind, and the tint is wrong for it: a LAMP is the one thing
on the body that gets brighter as the light goes, not darker. Tinting a lens
box makes the tail lights darkest exactly when they should be burning, so a
lamp wants an ADDITIVE layer over the lens (a `glowTexture()` quad with
`AdditiveBlending`, its own material so `applyTint()` never reaches it),
switched by `environment.lampsLit()`. The light it CASTS is a real spot in
environment.ts beside the headlight, which the Lambert world picks up and the
fullbright car correctly ignores.
