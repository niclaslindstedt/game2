---
title: A damage mechanic the driver can drive AROUND has to be one the bot plays too, or the field DNFs on it
date: 2026-09-03
scope: engine/sim/bot.ts
concepts: [bot-tuning, damage, cooling, difficulty, fairness]
---

`engine/game/cooling.ts` gives a holed radiator a temperature the driver
manages with the throttle. The bot drives flat, so the first version of that
mechanic cooked every rival that took a nose-on hit: probe it with a SOUND car
whose only injury is `damage.systems.cooling = 1`, driven by `botInput` down a
real stage — before the lift it retired inside 400 m on every seed, after it
finished all of them with the needle peaking around 80%.

The fix is four lines at the END of `botInput`, after the corner plan and
before the lean: past `TUNING.collision.cooling.warnAt` cap the throttle,
easing to `COOL_PEDAL` at the red line. Two things that make it right rather
than merely effective — cap it, never zero it (a car that stops moving stops
making the ram air that sheds the heat, so a full lift boils where it stands),
and change nothing else: the crew still brakes for the corner and still takes
the line, it simply arrives slower, which is the same trade the player gets.

The general rule: when a system gives the PLAYER a decision, ask what the bot
does with it before the PR lands. `make sim` will not tell you — bots take
almost no damage over a clean stage, so the table is a no-regression signal
and never a confirmation. The probe has to inject the damage.
