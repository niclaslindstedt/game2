---
title: A ground arrival across a whole face must not be charged the ring's point-impact rates
date: 2026-09-03
scope: engine/game/collision.ts, engine/game/roll.ts
concepts: [collision, damage, roll, wheels, tuning]
---

`TUNING.collision.systems.wheelFromFlank` (4.0/m) and its siblings are sized
for a SOLID driven into one corner of a panel — a trunk reaches past the sheet
metal and into the upright behind it. The ground does no such thing, and a roll
grinding along on one flank makes fifteen-odd contacts on that same face.

Wiring the roll's contacts through the same `dealWheels` path took both wheels
on the landing side off in every roll past a lurch, which is `beyondDriving`'s
second condition — so every roll retired the run. `landingDamage` passes
`flat: true` for exactly this reason; a flat arrival feeds the wheels only
through `wheelFromSideLand` / `wheelFromRoof`.

The same pass found the other half of it: `dealCrush` capped what it WROTE at
`zoneMax` but charged `dealSystems`/`dealWheels` the uncapped amount, so a car
pinned against one face went on losing its engine and its wheels to a panel
that was not moving. Charge the transfer on the fold the ledger actually
accepted; wear still takes the overflow, at `wearPastCap` of its rate.

The general shape: **any change that multiplies the NUMBER of contacts a face
takes will find every per-contact rate that was calibrated against a handful of
them.** Check `partAt`, `wearPerCrush` and the `systems` transfers together, not
one at a time — and probe it with a staged roll rather than a unit hit, because
the compounding is what breaks.
