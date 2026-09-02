---
title: A smoothing pass that is re-run over a streamed chunk's tail must read the walk's bare values, over the whole array — never its own output, never a slice cut at its own window
date: 2026-09-02
scope: engine/mapgen/compile.ts
concepts: [endless, streaming, runoff, idempotence, determinism, homesteads]
---

`tests/homesteads_test.ts` — "streams the same homesteads however an
endless stage's extends are chunked" — went red on `main` the moment R38
moved a homestead to six metres past a chunk seam, and the elevations it
showed differed in the fifth decimal. The road's HEIGHTS were identical;
its WIDTH was off by three quarters of a metre at every seam, and the
drive reads the road's edge through `corridorOffset`.

Two bugs in one shape, in both `bankRunoff` and `widthRunoff`. The pass
re-runs from `firstNew - reach` when a chunk lands, because the tail's
window was cut off at the frontier — right. But it (a) read `sample.bank`
/ `rawWidth`, its own smoothed output, so the tail was smoothed twice, and
(b) sliced its source at `start`, so the tail's left-hand neighbours were
gone and the re-run was truncated on the other side instead. Finite stages
never showed it: one append, `start = 0`, the slice is the whole array.

The rule: anything re-run over already-built road smooths from a BARE copy
the walk pushed (`bareWidth`, `bareBank`, like `rawY` for the heights), and
indexes that copy absolutely. The test that proves it is one endless stage
built in one extend against the same seed built in a dozen, every field on
every sample `toBe` — a probe that prints "which fields differ, where"
across the two found both halves in two runs.
