---
title: waterAt must answer against the surface the car stands on, and a bridge deck is not that surface
date: 2026-08-28
scope: engine/mapgen/terrain.ts, engine/game/step.ts
concepts: [collision, terrain, water, off-road]
---

The drown check (`step.ts`) is `waterAt(x, z) - car.y > TUNING.crash.deepWater`
with `car.y` riding `groundAt`. If `waterAt` answers off a DIFFERENT surface
than the car stands on, the car drowns through solid ground — the reported bug
was "I can drown through a mountain", and it was `waterAt` reading the analytic
field while the car rode the lattice.

The rule that holds: water exists at a point only where the ground the world
SHOWS there is under it. Three layers, in order — the lattice (`latticeAt`,
what the tiles draw), a road ribbon standing over it (no water: an embankment
over a lake is dry road), and a BRIDGE DECK, which is explicitly not ground, so
the river it spans still reports as water underneath it. A ford is the one road
that stays wet, and it needs a lip (`WADE_LIP`, 0.2 m) because the ribbon's
crown sits a hand's width proud of the water it wades.

Skipping the deck case silently deletes the water under every bridge, which
`tests/water_test.ts` catches only if the assertion is scoped to open country —
a blanket "ground is never above the water" assertion fails ON the deck.
