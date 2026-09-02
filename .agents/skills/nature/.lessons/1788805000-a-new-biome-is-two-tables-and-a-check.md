---
title: A new biome is a row on BOTH sides of the world — the engine's quilt in biomes.ts and the app's look in biome-<id>.ts — and the seam between them is only checked by a test
date: 2026-09-02
scope: engine/mapgen/biomes.ts, pwa/src/game/biome.ts, pwa/src/game/planting.ts
concepts: [biome, placement, groves, regions, flora, test-conventions]
---

The quilt is the engine's (`engine/mapgen/biomes.ts`: regions, groves,
whether there is water, what the loose road is made of, whether the woods
shed timber) because the trunks it places are solid; the species, the ground
palette and the ground-cover mixes are the app's (`pwa/src/game/biome-<id>.ts`,
registered in `biome.ts`), and a new roster of plants is its own file
(`flora-<id>.ts`) merged into `VARIANTS` in `flora-species.ts`.

Three seams, and none of them is typed:

- A community id on one side with no row on the other fails only on the
  seed that rolls it — `biome.ts` throws at import for a grove or region with
  no look, and the reverse (a look for a grove the engine never quilts) is
  checked there too.
- A species id in a `FloraMix` is a string; `buildFlora` throws on the first
  stage that plants it. `tests/biome_test.ts` walks every mix of every biome
  against `VARIANTS` so a typo fails in the suite instead of in a run.
- The app's soft/solid split (`SOFT_FLORA` in `planting.ts`) is a list by
  name: a new roster's brush has to be added to it or the engine's trunks get
  dressed as barrel cacti and the scatter never plants them.

And the absolute heights are the TAIGA's: `LAKE_Y + 4` is the shoreline,
`HIGHLAND_Y` is 26 m, the rock line paints from 26 m. A dry country keeps its
pans well above the lake table (`BiomeLand.floor`) and `mixAt` asks the
engine whether the country has water before it reads the height, or every
pan grows willows.
