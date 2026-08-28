---
title: A damage gauge with no handling effect is the whole bug — audit the ledger field by field, not effect by effect
date: 2026-08-28
scope: engine/game/damage.ts, engine/game/car.ts, engine/game/state.ts
concepts: [collision, damage, handling, tuning-loop]
---

"The car drives fine when it's destroyed in the HUD" was not a tuning
complaint. Four of `CarDamage`'s six fields — `wear`, `zones`, `belly`,
`broken` — reached the handling model only through `systems`, and `wear` is
exactly the field the HUD draws the body's own outline in. The player was
watching the headline gauge go red while nothing under it moved.

The audit that finds this is per-FIELD, not per-effect: list `CarDamage`'s
fields, grep each one for a read inside `car.ts`, and any field whose only
hits are `collision.ts` writing it and the renderer drawing it is decoration.
Reading the effects that DO exist and asking "are these strong enough" never
gets there — the existing ones were fine, they were just four short.

Two things the fix needs that are easy to miss:

- `car.ts` was at 972 of its 1000-line cap, so the derivation could not live
  there. `engine/game/damage.ts` — ledger in, multipliers out, called once at
  the top of `stepGrounded` — is the seam, and it keeps the "reads damage,
  never writes it" rule checkable in one file.
- A steering PULL belongs on the local `steer` the tires see, never on
  `car.steer`. `car.steer` is where the driver's HANDS are, and the rack ease
  (`(input.steer - car.steer) * rackRate`) would wash the pull out as fast as
  it was added.

Size the whole group against one bar: a car with every gauge at its worst
still finishing. The probe that says whether you hit it is top speed sound
vs. wrecked (204 → 67 km/h here) plus "can it still be pointed" — and
`gripFloor` is what stops suspension, structure and a missing wing stacking
into a car that cannot.
