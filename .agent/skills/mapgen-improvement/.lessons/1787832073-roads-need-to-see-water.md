---
title: A road builder that cannot see the water builds causeways — the bare landscape has to be its own module
date: 2026-08-27
scope: engine/mapgen/land.ts, engine/mapgen/spurs.ts, engine/mapgen/terrain.ts
concepts: [water, spurs, plausibility, terrain, road-network]
---

The far-field height lived inside `createTerrain`, which is built AFTER the
track — so the branch builder had no way to ask where the lakes were. It
ran branches straight out over open water, and because a branch flattens a
shelf under itself, the result was an embankment across a lake ending in
mid-air. Visible from a kilometer up, and invisible in every test.

The fix is structural: the bare country is its own module
(`engine/mapgen/land.ts`, `createLandField(seed, knobs)`), deterministic in
the seed and the dials and depending on nothing else. The terrain field
uses it, and so does anything that ROUTES — a branch now steers by the
clearance ahead on a fan of bearings and turns to follow the shore.

Two traps in doing it:

- **Keep the RNG stream aligned.** The extracted field drew the first
  `rng.int` of the terrain's sequence; drop that draw and every seed after
  it in `createTerrain` shifts and the sim digests move. Take the draw and
  discard it, with a comment saying why.
- **The bare field is not the same question as "is the road under water".**
  The stage road already runs over ground tens of meters below the water
  table, floated on its corridor shelf. So do not assert that no road
  sample is in water — assert the narrower thing that was actually wrong:
  a branch must END on dry ground. Trim trailing wet samples, with a floor
  so a junction never loses its other arm entirely.
