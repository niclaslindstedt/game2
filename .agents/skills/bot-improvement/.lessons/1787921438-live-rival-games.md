---
title: Fourteen bot games on a shared track cost ~11 MB and ~1% of a frame live, and ~15 µs per crew-step to write down in advance — the campaign traces them for the no-contact bargain, not for CPU
date: 2026-08-28
scope: engine/sim/field.ts, engine/sim/trace.ts, pwa/src/game/standings.ts
concepts: [rivals, performance, campaign, determinism, trace]
---

Running fourteen more `GameState`s live is cheap, and the measurement takes
two minutes:

    createGame × 15 on one compiled xlong track (5757 samples)
      → 182 ms to build, 11.0 MB of heap
    15 games × 1200 steps (10 s of race time) → 138 ms

That is ~1.4% of real time on a dev machine for the whole field. `createGame`
takes an already-compiled `track` and the track is READ-ONLY, so a rival is
a car, a terrain index and an RNG — not a world. Give each rival its own
`createTerrain` (it comes free with `createGame`): the terrain caches the
neighbourhood block its last query landed in, and fifteen cars in fifteen
places would miss that cache on every query.

The campaign's field is nonetheless WRITTEN DOWN before the green
(`trace.ts`, `FieldPlan.contact: false`), and the reason is design, not
cost: a ten-second interval is a story told over a rally real crews run
minutes apart, so a caught car has to be driven through, and a car nobody
can disturb drives a run that can be computed once. What that costs, seed
38, this box:

    short   1.9 s   89k crew-steps   1.6 MB
    medium  4.6 s  339k crew-steps   6.1 MB
    xlong  10.2 s  705k crew-steps  12.7 MB

About 15 µs per crew-step on a real stage (the 7.7 µs above was a bare
track), which the establishing shot's 4 ms slices cover on a short stage
and not on a medium one — the rest is the SETTING THE FIELD hold in App.tsx.
Nothing to trim there: the unfinished crews are engine retirements sealed
early, not wedged cars running to the cap, so the steps are the field's own
driving. A race tick over a traced field is then ~5 µs for all fourteen.

Two things any field needs from the engine: `createGame({ quiet: true })`,
or fourteen stage-announcement lines land in the log on every start; and
clocks that start at the green — a live rival is stepped only while the
player races, a traced one is posed by the field's clock.
