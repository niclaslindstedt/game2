---
title: `landingDamage` is called from three places and none of them hands it the same thing — the flight's slam is already netted of the ground's give
date: 2026-09-08
scope: engine/game/collision.ts, engine/game/flight.ts, engine/game/roll-contact.ts, engine/game/car.ts
concepts: [landing, collision, surfaces, invariants]
---

Arithmetic done against the raw descent will not match what the ledger
shows, and the gap is the surface. The three callers:

| Caller | Hands it | Notes |
| --- | --- | --- |
| `flight.ts` (touchdown) | `slam × (1 − groundOf(surface).give)` | the only one with a real attitude — passes `car.pitch` |
| `roll-contact.ts` (a body already over) | the arriving corner's own slam | a shell face; pitch is meaningless mid-roll |
| `car.ts` (a bank met at pace) | `hardLandSpeed + over` | GROUNDED — its `pitch` is the grade under the wheels, not a dive |

Two consequences worth having in mind before touching it. First, a fall onto
loose ground is a genuinely gentler arrival than the same fall onto tarmac —
`surfaces.give` is a quarter in open country — so anything sized off a
terminal-velocity plunge has to be sized off the SOFT case or it will only
fire on sealed roads. Second, `car.ts`'s call is why an attitude-dependent
rule cannot simply read `car.pitch` inside `landingDamage`: on a 45° bank a
grounded car sits at the clamp, and a rule that read it there would charge a
bank climb as a nose-first dive. Pass the attitude in from the caller that
actually has one.
