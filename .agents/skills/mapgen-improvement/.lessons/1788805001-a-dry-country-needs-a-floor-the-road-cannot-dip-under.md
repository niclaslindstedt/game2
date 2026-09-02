---
title: A country with no water still has to keep its ground above LAKE_Y — and the ROAD's own roll dips under the ground, so the floor clears elevation.amplitude too
date: 2026-09-02
scope: engine/mapgen/geology.ts, engine/mapgen/biomes.ts, engine/mapgen/compile.ts
concepts: [biome, water, terrain, elevation, plausibility, analysis]
---

Half the world reads "under water" off the number `LAKE_Y` rather than off
the water field: the previews paint blue below it, props refuse to stand
within a metre of it, the flora keeps off `LAKE_Y + 1.2`, `planting.ts`
plants a shoreline under `LAKE_Y + 4`. Turning the water off in the geology
(no pits, no basins, a table forty metres down) does nothing about any of
that if the rock still runs below the table — and a low country's hollows do.

So a dry country gets a FLOOR (`BiomeLand.floor`, a soft quadratic knee in
`geology.ts` so nothing creases), and the floor has to clear more than the
table: the road rides its own rolling profile on top of the country
(`R.elevation.amplitude` × the dial's band, up to ten metres), and the first
desert render showed a start apron painted as a lake because the roll had
taken the road eight metres under a pan. The floor is fourteen metres over
the table, and `buildRolling` scales the roll by the country's relief.

The analyzer's bands are the country's too (`ANALYSIS.ground.country`):
water and swamp shares are a point at zero, the forest band is a ceiling,
and the soil-on-slope rule uses sand's own angle of repose (0.7 m/m) where
till uses 0.45 — wind-blown sand lies on every dune's slip face, and the
till rule reported all of them.
