---
title: Any walk steered by two competing fields can limit-cycle — give it a "have I been here" guard, not a step budget
date: 2026-08-31
scope: engine/mapgen/river.ts
concepts: [water, rivers, search, terrain, analysis]
---

The river tracer steers by the downhill it feels plus a shove away from any
road it runs at. Where those two disagree across a cell boundary the walk can
settle into swapping between the pair forever: the surface only ever falls and
there is nowhere lower, no lake arrives, the map's edge never comes, and the
road's grace counter resets every time the cycle steps back out of the
corridor. Nothing ends it but the step budget — so it spends four hundred
steps on one spot and draws a full-width sheet of standing water there, over
whatever the road was doing underneath. On seed 21 that put 44 m of stage under
water 120 m from the nearest crossing.

It is latent on `main` too (seeds 2, 5 and 13 all carry one), which is the
point: a step budget does not prevent a cycle, it only decides how much
nonsense gets drawn before it stops. The guard is positional — a walk that
comes back within its own step of ground it has covered stops there — and each
walk then takes the ending it already had for "nowhere left to go" (a pool for
a mouth, "not the same water" for a reach between two crossings).

Two things worth copying:

- **Measure the guard on the WALK, not on the points it emits.** The drawn
  points carry the meander's sway on top of the walk, so they swing past each
  other by design.
- **The analyzer needs the second half of the measurement.** Distance alone
  cannot tell a bend from a cycle; distance AFTER a length of travel can. Over
  seeds 1-24 a healthy course comes back within 10.5 m of itself after at most
  85 m of running, and the cycles ran 3624 m — a clean two-orders separation,
  which is what a threshold wants under it.
