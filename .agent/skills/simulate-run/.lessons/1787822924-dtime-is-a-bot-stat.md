---
title: A big move in the sim's dTime column can mean the BOT changed, not the feel — check what the bot was asking for before calling it a regression
date: 2026-08-27
scope: engine/sim/bot.ts, engine/game/car.ts
concepts: [simulation, drift, bot-tuning, handling]
---

`dTime` counts seconds past `TUNING.drift.enterSlip`, driven entirely by
what the bot asks for. The bot plans corner speeds at `latFraction ×
gripAccel` and steers proportionally at a short lookahead, so if that plan
sits under the car's grip ceiling the bot NEVER commits a corner past the
limit — every drift in the column came from a handbrake flick or from the
car doing something the bot did not ask for.

That matters when handling changes: a car whose over-the-limit behaviour
used to run away gave the bot large drifts for free, and a car that answers
the lock proportionally does not. The column can halve with nothing having
happened to how the game feels in a player's hands.

Measure before concluding. Run a stage with `botInput` in a throwaway probe
and histogram `|inp.steer|` and `|car.slip|`, plus the demand ratio
`|u · steer · steerGain| / gripAccel`. A mean demand under 1 while steering
means the bot is driving a grip line and the drift column is telling you
about the bot. Say which in the PR — and if the bots should attack harder,
`latFraction` is the one knob, not the handling.
