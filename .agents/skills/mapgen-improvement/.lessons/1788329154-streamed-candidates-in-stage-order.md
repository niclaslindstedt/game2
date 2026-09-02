---
title: A streamed placer decides candidates in STAGE order, and a deferred candidate backs the cursor off so its junction is decided with it
date: 2026-09-02
scope: engine/mapgen/towns.ts, engine/mapgen/compile.ts
concepts: [endless, streaming, determinism, towns, placement]
---

An endless stage places in windows, and `tests/…_test.ts` compares the
chunked stream against one call. Two ways that comparison breaks:

- **Candidates gathered by KIND rather than by arc.** Runs first, then arms,
  means a single call tries a run at 8 km before an arm at 2 km, and a
  spacing rule measured from "the last town placed" then refuses the arm.
  Sort every candidate by its stage arc before deciding any; break ties by
  preference (the run before the arm at one junction).
- **A run deferred at the window's edge leaves its junction behind.** The
  run that is still open at `to` waits for the next call, but the arm at the
  junction it begins at has an `atS` just inside this window and would be
  decided now, alone — so on the next call the run comes second. Back the
  resume index off by `junction.parting` so the arm and the run are decided
  in the same window, in the same order, whichever call it is.

And compare streamed records to a tolerance, not to the bit: R31's cone
reaches further down the road than `STREAMED_HOLD`, so a drive's height
clamped to the band moves by microns depending on how much road the single
call had already laid. `tests/homesteads_test.ts` has an `expectClose` for
this.
