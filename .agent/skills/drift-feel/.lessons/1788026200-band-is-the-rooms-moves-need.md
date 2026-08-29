---
title: Scale `angleBand` DOWN with `angleSpan` and the moves have nowhere to take the car — the sim finds it before you do
date: 2026-08-29
scope: engine/game/defs/tuning.ts, engine/sim/bot.ts
concepts: [drift, angle-band, angle-span, sim-table, provocation]
---

Cutting the roster's drift meant `angleSpan` 0.65 → 0.36, and keeping
`angleBand` at its old fraction of it (0.5 → 0.31) looked like the obvious
companion move. It is not: the band is the ROOM every deepening force has
past the angle the wheel asked for, and the flick, the trailed brake and the
lever all work by taking the car into exactly that room. Narrowed with the
setpoint, they stop paying — and a driver managing a slide finds the car
falling out of it under them.

The sim is loud about it and the probe is silent. A settled lock sweep barely
moves (13.2° at 0.31 vs 14.9° at 0.42 — under two degrees), while `make sim`
went from a clean seed 1 to twenty-one seconds in the trees, one respawn and
100% wear on that one stage. Sweep the band across the whole sweep and read
`off`, not the angle:

| `angleBand` | 0.31 | 0.34 | 0.36 | 0.38 | 0.42 |
| ----------- | ---- | ---- | ---- | ---- | ---- |
| off-road, s | 66   | 63   | 52   | 45   | 41   |

0.38 and 0.42 are the same answer; everything under 0.36 is a car nobody can
hold. Ending WIDER than `angleSpan` is fine and now correct — two of three
layouts reach their real angles on a move rather than on the wheel, so the
room past the wheel's own ask is where those cars actually live.
