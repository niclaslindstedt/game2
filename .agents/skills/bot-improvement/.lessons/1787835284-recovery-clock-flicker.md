---
title: A bot recovery gated on a clock its own inputs reset flickers at 120 Hz — latch it on engine state instead
date: 2026-08-27
scope: engine/sim/bot.ts, engine/game/step.ts
concepts: [bot, recovery, wedged, reverse, state]
---

`state.stuck.since` is the honest "how long have I been going nowhere" signal
and keeps the bot stateless — but `stepStuck` resets the anchor whenever
`input.throttle <= 0.5`. So a recovery that reads `t - stuck.since > threshold`
and responds by lifting the throttle unsets its own trigger on the very next
tick: the bot alternates push/recover every 1/120 s and achieves nothing.

Two halves fix it. The bot latches on the CAR's state rather than the clock —
`wedgedFor > reverseAfter || (car.reversing && car.u > -reverseSpeed)` — so
once it is backing out it keeps backing out until the car is properly moving.
And `stepStuck` counts reversing as asking to move
(`input.throttle > 0.5 || car.reversing`), so a car pinned in FRONT and BEHIND
still reaches the engine's wedge respawn instead of braking forever, while one
that reverses free covers the anchor radius and resets the clock honestly.

With that in place the bot's old "wedged → reset" give-up comes out: reversing
off the thing is what a driver tries first, and the respawn is what happens
when that fails too.
