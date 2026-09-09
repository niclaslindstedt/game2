---
title: An elevation band is a percentile of its OWN country — the same treeline metres mean different things in two biomes
date: 2026-09-09
scope: engine/mapgen/biomes.ts, pwa/src/game/terrain.ts, pwa/src/game/ground-rules.ts
concepts: [biomes, terrain, elevation, calibration, bedrock, treeline]
---

`BiomeLand.zones` states the treeline, the rock band and the snowline as
ABSOLUTE heights, and a country with no massif floats up and down by seed —
so a band copied between two biome rows lands at a completely different
percentile of each. The taiga and the desert carried identical numbers
(`treeline: 46`, `rock: 26..52`). Measured in the road band over 40 seeds at
three lengths, the desert's ground reaches 26 m at p88 and 52 m at p99.6 —
correct. The taiga's stands about twice as tall (p50 16 m, p90 57, p99 91),
so the same band started at p65: an eighth of everything a player drove past
was painted solid bedrock, and any seed whose country ran high came out grey
end to end. `taiga-1` measured 98% rock and 96% above the treeline.

Above the treeline `soilOf` (geology.ts) drives soil depth to zero, so those
stages also lost their trees — the paint and the planting fail together, and
neither `make analyze` nor `make rate` reports it, because a grey treeless
stage breaks no rule and scores fine.

**Before moving a band, measure the country's own height distribution in the
ROAD BAND** (sample the terrain either side of the centreline over dozens of
seeds and several lengths), then place the band at the percentile you want.
Changing the treeline re-rolls the seeds that crossed it — the road follows
the soil surface — while low seeds stay byte-identical, so
`tests/alpine_test.ts`'s pinned digests can still pass while the country the
player sees has changed completely.
