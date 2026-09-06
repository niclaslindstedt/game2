---
title: A damage reading that is a pure function of the crush should be DERIVED, not added to CarDamage
date: 2026-09-06
scope: engine/game/collision.ts, engine/game/state.ts
concepts: [collision, damage, ledger, invariants]
---

The glass crazing looked like a new `CarDamage` field beside `wheels`. It is
not: `dealCrush` writes `zones[]` and `roof` as running totals, so anything
accumulated at a fixed rate off those bites equals a formula over the totals.
`glassCrack(damage, pane)` is that formula, and deriving rather than storing
paid for itself four ways — `shearedParts` (the hand-written ledgers a
preview tool or a fixture builds) and the live crash path agree by
construction instead of by somebody keeping two derivations in step;
`healCar`, `freshCar` and every serialization of `CarDamage` needed no edit;
there is no field for a future audit to find unread; and the renderer reads
the engine's own statement rather than a copy.

Two things it needs. The crossing detection ("has this bite carried the pane
over the top?") has no stored `was` to compare with, so snapshot the derived
values immediately before the write — into a module-scope scratch array, not
a fresh one, because `dealCrush` runs on every bite and a roll grinding a
flank is dozens a second. And the derived value must still be ANSWERED in
`damage.ts` (here: a crazed screen costs steering), or it is decoration by a
different route.

Reach for a stored field only when the reading is path-dependent — a
`wheels[i]` fed at different rates from a corner, a flank and a landing
cannot be recovered from the totals, which is why it is a field.
