---
title: The crash ledger's arm is ALREADY continuous — the leak is elsewhere, and the walk cannot be conserved without coupling the travel to the roll
date: 2026-09-04
scope: engine/game/roll-ledger.ts, engine/game/roll.ts, engine/game/roll-hull.ts
concepts: [roll, measurement, physics, debugging, probes]
---

The recorded diagnosis — that `standingOn().height` jumps, so a `move` term
built on it cannot be refereed — is WRONG. Measured over a full turn at 0.01°,
`patch.height` moves 1.6 mm a step: it IS `seatOn` (the lowest point is on the
plane by construction), and no hand-over can move it. What jumps is
`patch.across`, by 0.88 m. So the pivot's horizontal carry is `-seatOn x rate`
and its vertical is `slopes x rate`, both continuous, and the open question
"can the arm be read off `seatSlopes`" answers yes.

Tag the leak by REGIME (was/is airborne, contact or not) before theorising —
it splits into unrelated faults:

- **13.5% of `carry` was the flight riding the terrain.** `stepRolling` carried
  `centre` relative to `rollSeat`, which moves with the terrain AND with the
  attitude, so a flying body climbed hills for free. Fix: carry the weight's
  WORLD height, compare against `rollSeat + seatOn`. It works (air steps go to
  exactly 0.00) but halves every roll — `carry` 2.02 turns/0.41 g to 0.50/0.67
  — because it exposes the pivot exchange being charged on four consecutive
  steps of one hand-over. Ship the two together or neither.
- **9% of `cliff`/`bank` was the LAB**, standing placed cars at `groundAt`
  with no `hullStand`: 1.7 m of free fall in step one.

The grounded model is EXACTLY conservative on `1/2(u^2+w^2) + 1/2 over w^2 +
gh` — 0.00 gain on every grounded step of every scenario. Write the ledger that
way and `grd->*` goes to zero and `air->grd` explodes to 88%, which is the real
blocker: the grounded model treats travel and rotation as independent, so it
drops the cross term `travel . carry`. Measured at every takeoff, that term
reaches 151 j/kg against a 282 j/kg budget. **The walk has no energy to be
conserved with until the grounded step couples the two** — which is a different
model (inertia `spin + slopes^2`, half the current one) and a full retune.
