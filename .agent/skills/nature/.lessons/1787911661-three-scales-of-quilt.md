---
title: A forest reads as a forest at THREE scales — region, grove and stand — and the stand noise is the one that stops it looking sprinkled
date: 2026-08-28
scope: engine/mapgen/props.ts, pwa/src/game/biome.ts
concepts: [biome, placement, groves, regions, clustering]
---

The grove quilt alone gives you patches of different SPECIES at one
density each, which still reads as evenly sprinkled — every spruce wood
looks like every other spruce wood. Three scales fix it, all in
`engine/mapgen/props.ts` because the trunks are solid:

- `REGIONS` (~900 m) says what kind of country this is and re-weights the
  groves under it, so a stage crosses a handful of PLACES.
- `GROVES` (~150 m) picks the community, as before.
- `standDensity` (~42 m noise, squared and re-centred so its mean is
  exactly 1) multiplies the trunk chance inside one grove. This is the
  one that buys closed stands and the holes between them, and because its
  mean is 1 it redistributes the forest without thinning it.

Two traps. Clamp the product (region × community × stand) — `STAND_CEILING`
— or the densest stand saturates the 10 m tree cells into a straight
lattice that reads as an orchard. And keep lakeside/riverside CONTEXTUAL
(water proximity) rather than making them regions: a noise field will
happily put a "lakeside" where there is no lake.
