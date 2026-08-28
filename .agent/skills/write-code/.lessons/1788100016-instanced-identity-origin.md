---
title: An InstancedMesh instance nobody writes keeps the identity matrix — and renders at the world origin, which is the start line
date: 2026-08-27
scope: pwa/src/game/crowd.ts, pwa/src/game/
concepts: [rendering, instancing, three, culling, world-origin]
---

`new THREE.InstancedMesh(geo, mat, count)` allocates `count` instance matrices
already filled with the IDENTITY. There is no "unset" state and no automatic
cull: every instance draws, and one whose matrix was never written draws at the
world origin at scale 1. The stage's origin is where the car starts, so the
whole unplaced remainder of an instanced field piles up in the frame the player
opens on — read as one solid slab of boxes, because a few hundred coincident
meshes z-fight into whichever colour won.

The trap is a build-time placement pass that shares a code path with the
per-frame update, when that update culls by range. `buildCrowd` set
`live.fill(true)` and then called `update(0, focus)` to place everybody — but
`update` recomputes `live` from the focus point BEFORE writing anything, so the
fill was dead and only the stands within `LIVE_RANGE` of the focus were ever
placed. 216 of 261 spectators stood stacked on the start line.

Split the write out of the update: a `place()` that writes every live
instance's matrix, an `update()` that decides `live` and calls it, and a build
that sets `live` all-true and calls `place()` directly. If the range cull is
the point, the unculled pass cannot go through the culling one.

To VERIFY, count instances rather than looking: walk the scene, decompose each
matrix, and assert none is at the origin. Screenshots only prove the frames you
happened to capture, and a single tiny mesh at the origin is easy to miss.
