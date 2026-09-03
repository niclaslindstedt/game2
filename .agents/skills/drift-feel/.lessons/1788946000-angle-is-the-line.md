---
title: The angle IS the line — halve the roster's slip and every car corners wider, and no amount of `driftYaw` buys it back
date: 2026-09-03
scope: engine/game/car.ts, engine/game/defs/tuning.ts, engine/game/limits.ts
concepts: [drift, angle-span, angle-band, traction-ceiling, cornering, lat-give]
---

"Reduce the drifting" sounds like an ANGLE change and is also a LINE change,
because past the traction ceiling the two are one thing. `car.ts` delivers
`ceiling × (latGive × over + (1 − latGive) × tanh(over))`, and `over` is
`travel × latRate × slip / ceiling` — so slip is what buys lateral
acceleration once the tyres are saturated. At 35° of full-lock slide the
saloon pulled half again its stated `latCeiling`; at 18° it pulls about all
of it. Halving `angleSpan` and sizing `angleBand` on it cost every car
roughly a tenth of its cornering radius in real corners (drift lab: 23→24 m
for the rear-driver, 29→32 for the front-driver) and about an eighth of the
sim's pace.

Two things that do NOT get it back. `spec.driftYaw` up: it multiplies
`asked`, so it holds `driftYaw × depth` constant when a layout's `depth`
moves — worth doing, and it restores the low-speed line — but at pace the
radius is set by what the tyres deliver, and a sweep of it moved a 119 km/h
full-lock radius by 2 m in 62. `grip.latCeiling` up: the bot plans
`√(a_lat/κ)` off the same number, so the plan speeds up exactly as fast as
the grip does and the crews go off harder (1.4 → 2.0 took the rival field
from 10 DNFs to 20).

So: decide up front whether the ask is "less sideways at the same pace" —
which needs the ceiling AND the bot's share of it moved together, in
opposite directions — or "less sideways, and slower corners follow", which
is one change and is usually what is meant. Say which, with the sim's pace
column, before tuning anything else.
