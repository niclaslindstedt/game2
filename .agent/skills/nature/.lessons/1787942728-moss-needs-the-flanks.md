---
title: A tint on the up-facing facets alone is invisible from a car — and force it to a screaming colour to prove it is reaching the screen at all
date: 2026-08-28
scope: pwa/src/game/wild.ts
concepts: [stone, materials, review]
---

Moss baked into the wild's stone as `lerp(rock, moss, up²·1.7)` over a
dodecahedron's flat normals looked, in a driving screenshot, like no change at
all: the two facets with `normal.y ≈ 0.85` are a handful of pixels on a stone
seen from a car. What reads is the whole UPPER HALF going green, which means
the `0.53` flanks have to go most of the way over too —
`clamp((up - 0.1) · 1.6)` does it.

The diagnostic is worth more than the number: before tuning a vertex-colour
scheme, set it to pure red and rebuild. One screenshot then separates "the
effect is too subtle" from "the mesh is not being drawn", and those two have
identical symptoms and completely different fixes.

Mechanically: a per-instance choice of "mossy or not" cannot live in
`instanceColor` (it multiplies the whole stone), so it is two InstancedMeshes
sharing one obstacle list — one geometry with the moss baked in and a
`vertexColors` material, one plain. That is +1 draw call for the whole wild.
