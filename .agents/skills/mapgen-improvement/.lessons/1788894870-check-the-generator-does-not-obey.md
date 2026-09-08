---
title: A generator check measured against the field the generator OBEYS passes by construction — R18's float check did
date: 2026-09-08
scope: engine/mapgen/terrain.ts, engine/analysis/water.ts
concepts: [water, rivers, measurement, analysis, terrain, verge]
---

The river was traced against `farHeightAt` (the bare land) and
`analyzeWater`'s `water.float` measured its banks on `geology.surfaceAt` —
the same country. So every course passed, on every seed, while the game drew
a sheet of water five metres up beside a cutting. The ground a player SEES is
the bare land held under whatever the road cut out of it: R31's cone reaches
a hundred metres and takes up to eight off a hillside, and against that the
worst float on a 24-seed sweep was 24 m.

The fix is one field both sides read — `TerrainField.waterGroundAt` — and
that is the shape of the fix whenever a rule is written twice: the tracer
walks it and the analyzer judges against it, so they cannot disagree.

Two traps inside it:

- It is a `min` of the bare land and the shaped ground, never a swap. FILL is
  ground the road put there and the water takes no notice of it; a course
  read off an embankment either follows its flank down or refuses the reach
  at the ford. Only the CUT binds.
- `min(farHeightAt, coneAt)` is not the shaped ground. The corridor's cut is
  in `shape.raised` as well as in `shape.ceiling` (the other arm's
  `cutOther`, `shelfBeyond`), and reading the cone alone left 8 m floats
  standing. Use `rawHeight` — the shaped ground before the stream carve.

And expect the courses to MOVE: with the cut visible they drop into the real
valleys, where roads cross them on fill. One promptly ran under a BRANCH's
embankment, which `roadTopAt` did not know how to hide water under — it only
read the route.
