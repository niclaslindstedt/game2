---
title: The bot aims its NOSE at the lookahead, so a car that slides more runs it wide — sideways, the aim error belongs on the direction of travel
date: 2026-08-27
scope: engine/sim/bot.ts
concepts: [bot-tuning, drift, steering, off-road, handling-coupling]
---

Deepening the drift (a traction ceiling plus a bigger `angleSpan`) sent
off-road time across the eight-seed sweep from 2.9 s to 34.8 s and doubled
impacts, with pace unchanged. The cause was not the corner-speed plan: the
bot's base steer is `angleDiff(car.heading, desired) * steerGain`, so it puts
the NOSE on the lookahead point — and a car carrying 20° of slip then has its
velocity pointing 20° off the road.

The fix is one line, inside the `car.drifting` branch only: measure the error
against where the car is GOING, `angleDiff(car.heading + car.slip, desired)`
(world travel direction is `heading + slip`, since `w = V sin β`). Off-road
fell to 27.5 s, impacts back to the baseline 15, pace up slightly. The
existing `+ car.slip * 0.9 * counterWeight` stays: it is damping gated on the
nose being nearly back on line, not path following.

Two things that did NOT work, so skip them:

- Applying the path reference OUTSIDE the drift branch too. Transient slip
  then provokes drifts — the drift count went 299 → 558 and off-road to 43 s.
- Lowering `latFraction` to make the bot brake more. 0.6 costs 5 km/h of pace
  and still leaves 20 s off-road; 0.65 is worse than 0.7 on both. The bot was
  never arriving too fast, it was pointing the wrong way.
