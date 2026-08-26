---
title: World lighting is Lambert + real lights; baked-color surfaces (car, particles) take the light as a material.color tint
date: 2026-08-26
scope: pwa/src/game/environment.ts, pwa/src/game/renderer.ts
concepts: [lighting, time-of-day, tint, materials]
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
