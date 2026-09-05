---
title: A coefficient added at the ARRIVAL overspends the patch — the ground's plough belongs to the grind, never to `contact()`
date: 2026-09-05
scope: engine/game/roll-contact.ts
concepts: [roll, contacts, friction, coulomb, physics, surfaces]
---

The ground's plough (`TUNING.surfaces.plough`, a furrow's friction over the
shell's own coefficient) was first handed to BOTH rubs — the grounded step's
`g × dt` budget and the arrival's `grip × descent`. The bench ledger then
showed +1.6 and +6.2 J/kg on landing steps in sand and open country, and
nothing at all on tarmac. The give was innocent; zeroing the plough alone
cleared it.

The mechanism is pre-existing and the plough only exposed it. `rubGround`
spends one budget on four jobs, and each is capped SEPARATELY: the travel rub
at `min(speed, budget)`, each rotation at `min(budget, stopping(...))`. On
the grind the per-step budget is a few hundredths of a m/s and the caps never
bind together; on an arrival the budget is `0.7 × descent`, metres per
second, and a coefficient on top of it lets the travel and a rotation each
take a full stop of the same slip — an impulse larger than the slip it is
stopping, which is rotation made at the touchdown.

So a surface's extra friction is applied where a furrow is actually dragged:
in `stepRolling`'s rub, on the shell's share of the patch
(`1 - tyreShare`), and the arrival's budget is left as `grip × descent`. The
check that would have caught it in a minute is the one the bench already runs:
`crashEnergy` per step across every surface, with the plough on and off.
