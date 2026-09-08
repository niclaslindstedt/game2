---
title: Whether a road RIDES a landscape is the follow LAG, not the grade cap — the cap does nothing until the lag asks for the gradient
date: 2026-09-08
scope: engine/mapgen/compile.ts, engine/mapgen/biomes.ts, engine/mapgen/rules.ts
concepts: [road, elevation, terrain, ground-follow, biome, measurement]
---

The road's height is a first-order filter on the ground under it
(`followLand` in compile.ts): `want = base + (ground - base) * (1 -
exp(-step / lag))`, then two clamps. So the gradient the road can reach is
proportional to how far BEHIND the country it has fallen, and the lag is a
smoothing window — anything shorter than it is levelled away before the
clamps ever see it.

That makes `follow.grade` a dead lever on its own. Raising the desert's
grade multiplier from ×1 to ×3 (7.5% → 22.5%) moved the road's grade on a
dune flank by nothing at all: 7.4% → 7.8% p95, and the share of the
country's rise the road took stayed at 0.27. The cap was never binding,
because at a 140 m lag the road never fell far enough behind to ask for
more than 8%.

The pair has to move together, and the lag first: at 0.3 of the taiga's lag
with the grade at ×1.4 the same seeds take 0.61 of the sand's rise and
stand ±5 m off it instead of ±11 m.

Two things worth carrying:

- **Measure the ride CONDITIONED on the country being steep.** A desert
  stage is mostly flat pan, so a road-grade median over the whole stage is
  a statistic about pans and moves for no reason you care about. Filter to
  samples where the bare country under the road runs over ~8%, then compare
  the road's rise to the land's over the same window.
- **`grade` and `lag` are ROAD-BUILDING numbers, not mountain ones.** A
  test that asserts `land.grade === 1` on every non-alpine country as a
  proxy for "carries none of R47" breaks the first time a flat country
  wants a road laid differently. Assert the mountain fields.
