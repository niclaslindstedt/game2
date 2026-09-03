---
title: A ground feature finer than GROUND_CELL is removed from the DRIVING, not just the picture — a finer lattice must nest and be sampled through latticeAt
date: 2026-09-03
scope: engine/mapgen/lattice.ts, engine/mapgen/terrain.ts, pwa/src/game/terrain.ts
concepts: [terrain, lattice, jumps, renderer-seam, measurement]
---

`GROUND_CELL` is 14 m and the physics rides exactly the triangles the
renderer draws (`TerrainField.groundAt`). So a shape smaller than a cell is
not merely drawn badly — it is not THERE. An authored jump ramp 8 m long
does not exist to the car either.

Where something has to be finer (the training ground's ramp, its graded
roads, its banked corner), give that region its own lattice and make it
NEST: `GROUND_CELL / 4`, so every country corner is also a fine corner and
the two meshes share their boundary vertices exactly. Two rules make the
seam invisible and honest:

- **The fine tiles sample `field.latticeAt`, never `heightAt`.** Sampling
  the analytic field four times finer draws a curve the physics is not
  standing on, everywhere outside the fine region. Sampling the LATTICE
  finer reproduces the coarse surface exactly — re-interpolating a
  piecewise-linear surface on a nested grid is the identity — so a fine
  tile beside a coarse one has no crack and no disagreement.
- **The boundary of the fine region must sit where the fine field asserts
  nothing.** If the region's own blend weight is still non-zero at the
  boundary, the coarse tile beside it draws the un-blended country and the
  two disagree by exactly the blend.

Cost is smaller than it looks: `make profile`'s `training` row is 366 draws
and 376k triangles against `driving`'s 347 and 742k — a 4x lattice over a
300 m pad is cheaper than a forested stage, because ground is one merged
mesh per tile and trees are not.
