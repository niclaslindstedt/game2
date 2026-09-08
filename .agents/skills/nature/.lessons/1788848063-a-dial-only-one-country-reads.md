---
title: A dial only one country reads goes in `landOf`, returns the ROW ITSELF at rest, and compares on the DIAL and not on the metres
date: 2026-09-08
scope: engine/mapgen/rules.ts, engine/mapgen/biomes.ts
concepts: [biome, dial, knobs, determinism]
---

`landOf(knobs)` is the one place a dial is read onto a `BiomeLand` row, and
`peaks`/`altitude` set the pattern a new one should copy exactly:

- **The row is the country at the dial's REST.** `landOf` hands the row object
  back by identity there, never a copy built out of multiplications by one —
  `1 - (1 - 0.3) * 1` is `0.30000000000000004`, and a country that differs from
  its own row in the last float bit is a country whose seeds differ from the
  shipped ones. `tests/dunes_test.ts` asserts the identity with `toBe`.
- **Compare on the DIAL, not on what it reads onto.** `knobScale(0.22, {0,100})`
  happens to be exactly 22, but that is luck; comparing `dial ===
DEFAULT_KNOBS.dunes` is what `challengeMul` and `altitudeMul` both do and it
  is right for the same reason.
- **The cache key must grow with the dial** (`${biome}|${altitude}|${dunes}`) —
  `landOf` is memoized because the ground paint asks it per cell, and a key
  missing the new dial serves one country's row for another's.
- **A dial whose bottom means "none" should return `null`, not a zero.** A
  zero-amplitude dune row divides by a zero period downstream; `dunes: null` is
  what every reader already branches on.

Gate the row on a FLAG rather than on the country's name (`BiomeLand.dunes !==
null`, `BiomeRules.blown`), so a fourth country gets the row offered without
anybody coming back — and the menu asks the same question (`hasDunes`,
`hasSandstorms` beside `hasAltitude`).
