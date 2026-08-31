---
title: `dealCrush` is the single funnel into the damage ledger — gate the LEDGER there, never the contact that reached it
date: 2026-08-31
scope: engine/game/collision.ts
concepts: [collision, damage, events, difficulty]
---

Every mark a run ever makes goes through one function: `dealCrush` in
`collision.ts`. The solids path, the ground-as-a-wall path, the landing path
and the car-to-car path all end there, so anything that has to scale, gate or
observe the ledger — the difficulty's `CarState.damageScale`, the two-line
`systemFail` calls — is one edit there and needs no new hook anywhere else.

The ordering inside it is the part that is easy to get wrong. By the time
`dealCrush` is called the CONTACT has already happened: the impulse is spent,
the springs are loaded, the car has been pushed back out of the trunk. So the
`impact` event and `stats.impacts` must be booked BEFORE any early return, and
only the writing-down is allowed to be skipped. Gate above them instead and a
car that keeps no damage stops making noise, stops shaking the camera and
stops throwing dust — which reads to a player as the collision model being
broken, not as an assist.

Crossing detection for a call belongs beside the write it observes (`was` read
immediately before `Math.min(1, …)`), because damage is dealt in dozens of
small bites: comparing before and after each bite fires exactly once on the
bite that carried the value over the line, and nothing fires on the rest. A
threshold tested against the current value alone would call out on every hit
after the first.
