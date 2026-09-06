---
title: The heights that separate meadow, rock, forest and snow are the COUNTRY's, not constants — a biome with a massif needs them on its row, read by geology, paint, planting and the map
date: 2026-09-05
scope: engine/mapgen/biomes.ts, engine/mapgen/geology.ts, pwa/src/game/terrain.ts, pwa/src/game/planting.ts, scripts/lib/stage-render.mjs
concepts: [biome, zones, treeline, snow, alpine, terrain, planting, renderer-seam]
---

The taiga's 26 m rock line (`ROCK_LINE` in the app's terrain paint), the
26 m `HIGHLAND_Y` in `planting.ts`, the 46 m soil line in the geology
(`soil.alpine.from`) and the preview renderer's own copy of the rock line
were four restatements of one fact about ONE country: how high its hills
get. A country whose crests stand 500 m over its floor paints entirely as
rock under them and plants its whole forest as highland scrub.

They are now one row: `BiomeLand.zones = { treeline, rock: { from, to },
snow }` in world metres, the taiga's carrying exactly the old numbers so it
paints and plants as before. The geology strips soil above `treeline`; the
compiler puts SNOW on the road above `snow`; the paint, the planting and
`stage-render.mjs` read the same three. Anything new that asks "how high up
is this" reads the zones — never a literal.

The start of a mountain stage is chosen against them too: `startHigh` takes
the highest level shoulder no higher than `SHOULDER_OVER_SNOW` over the
snowline, so the grid stands beside the snow with the whole descent under
it rather than on a summit where every way down is a wall.
