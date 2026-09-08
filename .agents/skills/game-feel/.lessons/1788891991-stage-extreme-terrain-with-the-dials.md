---
title: Stage extreme terrain with the generator's DIALS, not by hunting seeds — and size a staged throw by measuring, because a plausible one photographs a respawn
date: 2026-09-06
scope: pwa/src/tools/, scripts/
concepts: [camera, harness, staging, seeds, verification, measurement]
---

A camera sheet that needs a HUNDRED-METRE fall does not need the right seed:
`createGame({ knobs: { biome: "alpine", altitude: 1 } })` is six thousand
metres of rock with the road blasted along one ledge and the green a mile below
(R47), on whatever seed the other sheets already drive. Sweeping ten default
seeds for a big drop beside the road found 45 m at best; the same seed at those
two dials gives 126 m. The dials are the staging tool — `biome`, `altitude`,
`peaks`, `steepness` — and they keep the sheet on one seed, which is what makes
two sheets comparable.

Then size the THROW by measuring, in a headless probe with no renderer in it.
A throw that looks reasonable mostly buys a car that lands on the shoulder,
rolls down it and is put back by the respawn — three events photographed and
none of them the one under test, which on the sheet reads as a `+16 m` jump in
the lens's own travel column. Sweep `lift` × `across` against three numbers —
how far below takeoff the car gets, its LONGEST unbroken air time, and the
respawn count — and pick a cell with no respawn and a real fall. For seed 38 at
those dials it is `lift 5, across 22` at t=15 s: bounces down the flank for
three seconds, then falls freely for 110 m at 60 m/s.

And render only what is looked at. Stepping the bot to the staging point with
nothing drawn under it — then rendering a second of run-in to settle the rig —
is what keeps a twenty-second staging point from costing four minutes of
software rasterizer per row.
