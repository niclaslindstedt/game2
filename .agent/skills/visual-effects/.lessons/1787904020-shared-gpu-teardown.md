---
title: A three.js resource shared across a streaming world must be marked, or the first chunk dropped frees it out from under the rest
date: 2026-08-28
scope: pwa/src/game/, pwa/src/lib/shared-gpu.ts
concepts: [rendering, three, teardown, streaming, tooling]
---

The world is torn down by walking a group and disposing what hangs off it
(`disposeGroup` in world.ts, `dropCell`, `dropTile`). That is right for
anything the group OWNS and catastrophic for anything it merely USES.

The moment a texture, geometry or material is shared — the flora library's
built shapes, the two materials it plants them with, every procedural
texture in textures.ts — the first chunk to be dropped disposes it and
everything still standing goes blank or untextured. It will not throw; it
will just look wrong, and only after the endless stage has streamed far
enough to prune something.

So sharing comes with a contract, and `pwa/src/lib/shared-gpu.ts` is it:
`shareOne()` memoizes and stamps `userData.shared`, `isShared()` reads it,
and **every** teardown path checks before freeing — including
`material.map`, which `disposeGroup` disposes separately from the material
itself.

When you make something shared, grep for every `.dispose()` that could
reach it and guard or delete that call. The ones that bit here were
`terrain.dispose` (its own `groundTex`, now the app's `detailTexture`) and
`disposeGroup`'s `mat.map?.dispose()` (the road's gravel texture).
