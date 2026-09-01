---
title: `face` answers two different questions — strip soil with all the slope, gate water with only the sheer
date: 2026-08-30
scope: engine/mapgen/geology.ts
concepts: [terrain, water, soil, plausibility, pits]
---

`layers()`'s steepness term feeds both the soil model (till is scoured off
slopes) and `pitAt`'s `flat` gate (steep ground drains, so it holds no water).
Those look like one question and are not.

Adding the hills' own gradient to `face` — correct for soil, and needed the
moment the hills carry real amplitude — shut the pits off across most of a
hilly country, because an ordinary hillside reads as 0.3+ against `pits.flat`.
What survived was the deep sea basins, whose shores drop away too steeply to
drive out of: `tests/water_test.ts`'s shallows scenario could not find a
wadeable shore in seventy seeds.

So `layers()` returns both. `face` (mountain flank, escarpment step, AND the
hills' differenced gradient) strips soil. `sheer` (flank and step only) gates
the pits. A hollow on a broad rise still gathers a mire, which is the most
ordinary water there is.

The hills' gradient is also the module's ONLY paid-for derivative — every
other steepness term is a smoothstep's own `t(1-t)`, free. Value noise has no
such trick, and the layer that carries the grade a driver reads is exactly the
one that needs it. Two extra lookups took `perf.ground` from 1.17 to 1.37 µs
against a budget of 4.
