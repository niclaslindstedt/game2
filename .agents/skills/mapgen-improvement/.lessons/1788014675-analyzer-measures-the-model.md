---
title: An analyzer that reads the generator's INTENTION passes stages that are visibly wrong — measure the result
date: 2026-08-29
scope: engine/analysis/
concepts: [analysis, scoring, terrain, flora, verification]
---

Three of the first checks written measured the wrong object, and all three
failed the same way: they asked the field that DECIDES something instead of the
thing that came out.

- `ground.rooting` asked the grove quilt whether a spruce wood had soil under
  it. The quilt never looked at the soil, so the check reported a defect on
  every seed no matter what the placement code did. It has to ask
  `terrain.treesNear` — the trunks that actually stand there.
- `water.float` probed `terrain.heightAt`, which contains the channel's own
  carve and the road's verge cone. Both are the analyzer's own subject matter
  cutting the ground away under the measurement. It has to probe
  `geology.surfaceAt` — the bare country the course was traced against.
- `rollers.cross` treated the ribbon/lattice seam at `half + ROAD_CROSS.reach`
  as mat, so every stage reported an error at exactly that offset. The severity
  has to key on the MAT (`|lateral| <= half`), not on the ribbon.

The tell in all three: a finding that appears on every seed at the same value
or the same place is almost never a defect on every seed. It is the check
reading a field that cannot answer the question. Before fixing the generator
for a universal finding, print the value across eight seeds — a constant is a
measurement bug.
