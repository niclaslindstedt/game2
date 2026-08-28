---
title: Fourteen extra bot games on a shared track cost ~11 MB and ~1% of a frame — measure before assuming a field has to be precomputed
date: 2026-08-28
scope: pwa/src/game/standings.ts, engine/game/step.ts
concepts: [rivals, performance, campaign, determinism]
---

The campaign's field was nearly built as a baked table of times, on the
assumption that running fourteen more `GameState`s live would be too
expensive. It is not, and the measurement takes two minutes:

    createGame × 15 on one compiled xlong track (5757 samples)
      → 182 ms to build, 11.0 MB of heap
    15 games × 1200 steps (10 s of race time) → 138 ms

That is ~1.4% of real time on a dev machine for the whole field. The reason
it is cheap is that `createGame` takes an already-compiled `track` and the
track is READ-ONLY, so a rival is a car, a terrain index and an RNG — not a
world. Give each rival its own `createTerrain` (it comes free with
`createGame`) rather than sharing the player's: the terrain caches the
neighbourhood block its last query landed in, and fifteen cars in fifteen
different places would miss that cache on every single query.

Two things a live field needs from the engine: `createGame({ quiet: true })`,
or fourteen extra stage-announcement lines land in the log store on every
start; and stepping the rivals only while the player's phase is `racing`, so
both clocks start at the green light rather than fourteen of them running
through the countdown.

A live field is also the only version that cannot go stale: it is driven by
the same handling the player is driving, so a tuning change moves the rivals
with it.
