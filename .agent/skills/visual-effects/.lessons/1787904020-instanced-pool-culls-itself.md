---
title: Pooling instances across a streaming world gives up three's frustum culling — the pool has to do its own, with hysteresis
date: 2026-08-28
scope: pwa/src/game/flora.ts, pwa/src/game/wild.ts, pwa/src/game/environment.ts
concepts: [rendering, instancing, three, culling, particles]
---

One InstancedMesh per variant across a whole streaming population is the
right answer when each patch of ground holds too few of any one thing to
be worth a draw call (the wild's cells: two dozen variants, a handful
each, ~180 draws for ~600 plants). But it costs you culling twice over:

1. **Three cannot cull it.** The pool is ONE object whose bound spans
   everything in it, and the camera stands in the middle of that — the
   test always answers yes. Same trap as the sky's cloud ring.
2. **Its bound goes stale.** `InstancedMesh.computeBoundingSphere()` runs
   once and caches; if instances move every frame it is wrong forever
   after. Either call it on every rewrite (the pools do) or state
   `mesh.boundingSphere` outright.

So the pool culls itself: pick the visible patches, rewrite the buffer
with only those, set `mesh.count`. Two things that are not obvious:

- **Hysteresis is mandatory, not polish.** The chase camera shakes. A cell
  sitting on the frustum edge crosses it and back every frame, and every
  crossing rewrites the whole pool. Give a patch already on screen a wider
  bound than one coming in (`CELL_HOLD` in wild.ts, 60 m).
- **`count = 0` is still a draw call.** Hide the mesh instead
  (`mesh.visible = false`) when a variant has nothing standing.

And per-instance cosmetics must come from the instance's own POSITION, not
from a stream of random numbers: a rewrite reorders everything, so a tint
drawn from `rand()` makes the forest shimmer on every flush.
