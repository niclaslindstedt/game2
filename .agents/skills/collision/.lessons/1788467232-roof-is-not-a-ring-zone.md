---
title: The 8-zone damage ring is a PLAN view — it has no roof, so a rolled car folded a flank
date: 2026-09-03
scope: engine/game/collision.ts, pwa/src/game/car-damage.ts
concepts: [collision, damage, roll, zones]
---

`DAMAGE_ZONES` rings the body in the ground plane: nose, corners, flanks, tail.
There is no face for the roof, and `landingDamage` used to map every attitude
past `air.rollLandLimit` onto zone 2 or 6 by the sign of the tilt — so a car
that came down squarely on its ROOF scuffed a door skin, and the windscreen
(`glassF`, bolted to zones 7/0/1) could not break in a roll at all.

The roof is its own ledger (`CarDamage.roof`), like `belly` and for the same
reason, with its own shear list (`ROOF_BOLTS`) because the parts it takes are
not a zone's: every pane at once, then the mirrors, then the lids.

Two things a new ledger field owes, both easy to miss because neither fails
loudly:

- **`damageEffects` must read it** (`engine/game/damage.ts`) or it is a gauge
  the player watches move while the car drives the same — the invariant this
  skill states. `roof` goes into `totalCrush`, and so do the sim's own crush
  totals in `engine/sim/simulate.ts` and `field.ts`.
- **`cloneDamage` in `engine/sim/trace.ts` must copy it.** That one the
  typechecker does catch; the two sim totals it does not.

Renderer side, a roof fold is the mirror of the belly's sag in
`car-damage.ts`'s `bendPanel` — a `high` factor over the waist line instead of
a `low` one under it, pushing down and leaning across.
