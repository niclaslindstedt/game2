---
title: A car property the BOT does not read can never show up as pace — the corner plan has to see the surface and the tires
date: 2026-08-27
scope: engine/sim/bot.ts, engine/game/defs/cars.ts
concepts: [simulation, bot-tuning, surfaces, cars, balance]
---

The bot planned every corner at `spec.gripAccel × latFraction` — the number on
the car's spec sheet, with nothing about the surface it was standing on. So
per-car tire compounds could be added to `cars.ts`, wired correctly into
`car.ts`, verified in a probe, and still move the sim table by ~0.1%: the bot
braked for a sealed corner exactly as if it were gravel, and the whole surface
half of each car's character was invisible to every measurement.

Multiplying the per-sample cap by the grip the car will actually have there —
`TUNING.surfaces.grip[sample.surface] × (asphalt ? tyres.sealed :
tyres.loose)`, read from the sample AHEAD, exactly as `car.ts` reads it —
turned that into a 4–8% spread and made the roster balanceable at all.

The general rule, and it bites on any new car knob: **before tuning a
catalog property, check that `botInput` reads something derived from it.**
A property the bot is blind to will look inert in the table no matter how
correct the physics is, and the natural response — turning the knob further —
is wasted work. If the bot genuinely should not know about it (a feel
property), say so in the PR instead of measuring it here.
