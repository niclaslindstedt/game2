---
title: A suspended sequence still MOVES the car, so anything it derives from geometry must be re-read every step — and its exit owes the car a seat, not a ground height
date: 2026-08-29
scope: engine/game/step.ts
concepts: [run-phases, orchestration, terrain, water, respawn]
---

`stepDrowning` integrates `car.x/z` for half a second of real travel
(`drown.stopIn`) while holding `car.y` against the water surface captured at
ENTRY. A car that clips a shoreline at pace drives itself onto the bank and
is then pulled down to a waterline that is now metres below the ground it is
standing on — it drowns in the beach. Any suspended sequence that both moves
the car and pins it to a captured height owes a per-step re-read of the
geometry under it, and an exit for the case where the car has left the
situation the sequence exists for.

Two things that exit owes:

- **Seat the car with `seatOn` (exported from `car.ts`), never a bare
  `terrain.groundAt`.** The centre height leaves a body corner under the
  surface, and `stepGrounded`'s wall check divides that rise by the distance
  covered THAT step — tiny for a car crawling out — so it reads as a face and
  hits the car with an impact it never drove into.
- **Re-anchor `state.stuck`.** The wedge clock did not run during the
  sequence, so a car handed back at 1 m/s inherits a stale anchor and gets
  fetched by the rescue two seconds later.

The bar to leave must sit under the bar to enter (`drown.shallows` under
`crash.deepWater`), or the state flips on alternate steps.
