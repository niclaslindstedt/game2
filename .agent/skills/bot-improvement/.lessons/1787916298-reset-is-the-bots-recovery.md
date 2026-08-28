---
title: The reset button IS the bot's off-road recovery — do not make it more patient
date: 2026-08-28
scope: engine/sim/bot.ts
concepts: [bot-tuning, off-road, respawn, recovery]
---

`botInput`'s off-road branch gives up after 8 s (`state.t - state.offRoadSince

> 8`) and presses `reset`. That looks like a heuristic worth tuning and is
actually the bot's only recovery: it cannot reliably drive itself back onto the
road. Steering still aims at a lookahead sample and the throttle rule cruises,
but on a stage where the excursion has any shape to it the bot circles near the
verge indefinitely — on and off the road every few seconds, `progressIndex`pinned, never far enough out or turned far enough away to be`state.lost`, and
> never still enough for the engine's wedge rescue.

Measured on seed 7 endless, 90 s: the shipped 8 s rule drives ~1.7 km of road;
gating the give-up on `state.lost` plus a 20 s timeout drives less and stalls
at one spot for 30 s at a time. A patience change here is a regression, not a
tuning knob, unless the bot first learns to navigate back.

The corollary bites when the COST of a respawn changes (checkpoints, R28): the
bot's economics change with it, and the temptation is to retune the give-up.
Measure before believing it. Also: `tests/simulation_test.ts`'s endless scene
asserted net `progressS`, which a respawn that winds progress back turns into a
measure of the bot's excursions rather than of the stream. Assert the ROAD
DRIVEN (sum the per-step ground covered, skipping the teleport step) — it says
what the test's name claims and survives any respawn rule.
