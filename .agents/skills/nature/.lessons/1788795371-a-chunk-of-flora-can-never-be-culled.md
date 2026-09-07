---
title: A finite stage is ONE chunk, so its flora mesh spans kilometres and can never be culled — `castShadow` on it draws the whole forest every frame
date: 2026-09-07
scope: pwa/src/game/flora.ts, pwa/src/game/world.ts
concepts: [flora, rendering, three, instancing, streaming, shadows]
---

`buildFlora` makes one `InstancedMesh` per variant per CHUNK, and world.ts
builds a finite stage as a SINGLE chunk. So a species' mesh holds every plant
of that species on the whole stage, and its bounding sphere is kilometres
across. Nothing frustum-culls it — not the camera, and not a shadow camera
whose frame is 80 m.

That makes `mesh.castShadow = true` on world flora a trap that looks like a
one-line feature: every tree on five kilometres is drawn into the depth map
on every frame, which is the "a forest drawn into one is not" that
car-shadow.ts warns about in its own header.

There is no escape hatch in three, either. The obvious one — put the casters
on a layer the camera cannot see — does not work: `WebGLShadowMap` gates each
caster on `object.layers.test( camera.layers )` against the SCENE camera, so
a mesh the camera cannot see casts nothing. "Cast but do not draw" does not
exist; the nearest thing is a material with `colorWrite` and `depthWrite`
off, and `material.visible` must stay TRUE or the shadow pass skips it too.

The pattern that works is a POOL outside the chunks (`flora-shadow.ts`): a
small instanced mesh per species carrying only what is in range, refilled as
the focus moves. Bound it on BOTH axes — instances per species (geometry) and
number of species (draw calls) — or the cost varies with whatever the biome
plants. Measured: unbounded by species it was +70 draw calls a frame, almost
all of it undergrowth too short to throw a shadow anybody would see.
