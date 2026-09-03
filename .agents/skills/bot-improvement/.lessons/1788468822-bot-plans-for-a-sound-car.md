---
title: The bot planned every corner for a SOUND car — a damaged one drove off at the same metre forever
date: 2026-09-03
scope: engine/sim/bot.ts, engine/game/limits.ts
concepts: [bot-tuning, damage, collision, corner-speed, respawn]
---

`game/limits.ts` exists so the bot plans off the same ceiling `car.ts`
enforces — its header says a bot planning off one number while the rubber
delivers another "is not a driver misjudging a corner, it is two different
cars". `damageEffects` was exactly such a pair of numbers and the bot read
neither: `car.ts:1226` multiplies lateral grip by `hurt.grip` and `:1150`
multiplies the brake pedal by `hurt.brake`, while `botInput` planned on
`latCeiling(spec, 1)` and `2 * spec.brake` flat.

A sound car hid it. A crippled one — half its grip gone, a wheel flat —
arrived at the corner that had just caught it out at the speed a sound car
holds, went off at the same metre, was put back at the same board, and did
it again until the clock ran out. `tests/scars_test.ts` is the test that
catches it, and it catches it as a crew respawning four times inside 40 m.

The fix is two multiplications in `botInput` (`hurt.grip` on `latAccel`,
`hurt.brake` on `braking`, the latter flowing into `scarPlan` for free), and
it makes the bot FINISH stages it used to retire on rather than merely
slowing it: seed 14 hard went from five respawns and a retirement to three
and a finish.

The general rule: **anything `damageEffects` multiplies into the physics,
the bot has to multiply into its plan.** When adding a field to
`DamageEffects`, ask whether the bot plans around the thing it scales — and
note that `make sim`'s summary can be identical while this is badly wrong,
because the sweep's bots barely damage their cars. The signal lives in
`scars_test` and in per-row off-road time, not in the summary line.
