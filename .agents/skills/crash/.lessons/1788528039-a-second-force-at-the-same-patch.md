---
title: A new force at the contact patch must be taken OUT of the ground's budget, not added beside it — and only an engine may add speed
date: 2026-09-04
scope: engine/game/roll.ts
concepts: [roll, friction, coulomb, contacts, physics, input]
---

`driveRolling` puts the driver's tyres at the same patch `rubGround` is
already spending. Written as an independent force it looked fine and was
wrong twice over, both of them invisible in a diff:

**The double spend.** Both took a full Coulomb budget, so the patch made up
to twice the grip it has. The symptom was not "too much grip" — it was that
steering EITHER WAY tripped the car, because the commanded lateral force
moved the body sideways and the ground then reacted to that new slip at full
budget. The fix is an ORDER, not a cap: the driver runs first, returns the
fraction of the patch it consumed, and `rubGround` is handed
`normal * (1 - that)`. Express the fraction against the patch's own budget
(`gripOn × normal`), never against the load — the driver spends the tyres'
coefficient where the ground spends the face's, and mixing the two hands the
ground back the wrong share.

**Work out of nothing.** An impulse applied as `car.u += dU; car.w += dW` in
the car's axes GROWS the travel whenever it is not perpendicular to it. A
lateral tyre force has no engine behind it, so that is energy from nowhere:
`crashEnergy` rose 60 j/kg over a hundred steps against a neutral baseline of 7. Cap the pair together at `speed + <the throttle's own share>` — scaling
both components keeps the redirect and deletes only the growth.

The general form, and it is the module's spine restated: before adding any
term to the crash, name where its energy comes from AND whose budget it
spends. Then prove it — with neutral input the whole of `make crash` must
come back bit-identical, which is the cheapest regression test this module
has.
