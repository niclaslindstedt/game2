---
title: Never edit a biome row with a repo-wide sed, and never trust an analyzer delta before the taiga/desert digest parity check
date: 2026-09-08
scope: engine/mapgen/biomes.ts
concepts: [biomes, r40, massif, alpine, determinism, seeds, measurement]
---

Sweeping the alpine's `steer` with `sed -i "s/    steer: [0-9.]*,/    steer:
1,/"` set it on all THREE biome rows — the taiga's and the desert's are `0`
and are the R40/R47 gate that keeps every seed those countries ever built.
Nothing failed loudly: the analyzer just reported the taiga at 14 errors
instead of 3, which reads exactly like a regression in the change under test
and sent me looking in the wrong module.

Two habits that make this cheap:

- **Address a biome row by LINE, not by pattern** (`sed -i '659s/.../.../'`),
  or edit it directly. The rows are deliberately parallel, so every field name
  in one appears in all of them.
- **Run the digest parity check BEFORE reading any analyzer delta**, not at
  the end as a formality. Twenty lines of script — `compileStage` over both
  untouched countries across a spread of seeds and lengths, hash x/z/elevation
  — stashed against the working tree, is a couple of seconds and turns "did I
  break the other countries" from a worry into a fact. `make routes` is the
  same check from the other side: only the alpine's polylines should move.

The same trap is waiting for any per-country field — `grade`, `earthworks`,
`floor`, `tunnels`, `startHigh`.
