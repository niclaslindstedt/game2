---
title: A lateral offset applied at the lookahead only moves the car a fraction of it — scale by the target's distance, and stop scaling once alongside
date: 2026-08-29
scope: engine/sim/bot.ts
concepts: [bot-tuning, traffic, overtaking, steering, lookahead]
---

The bot aims at a point `max(8, u × lookahead)` metres down the road. Pushing
that aim point sideways by `d` metres to go round a car does NOT put the car
`d` metres off the crown: the car being passed is a few metres away and the
aim is twenty, so the path only bends a fraction of `d` by the time the two
are level. Aiming a 1.2 m clearance measured out at 2.0 m of actual
separation — no contact where contact was the whole point.

Scale the offset by `lookaheadMetres / targetDistance`, capped (`PULL_MAX`,
2.4): a bot that answered a car in its own bumper with an unbounded offset
would leave the road to avoid it.

The trap is the second half. Keep amplifying once the two are ALONGSIDE and
the widened aim drags the car back off the thing it has just drawn level with
— for a crew with a temper, straight out of the lean it was applying. So the
amplification is gated on `ahead > halfLength × 2` (the move still being set
up) and drops to 1 the moment they are level.

Symptom of getting this wrong: a clean monotone ladder in "how close it
passed" against `aggression`, with the last third of the scale doing nothing
because the aim and the shove are cancelling. Measure with two cars on a
straight and a 6 m/s closing speed — a runaway speed delta hides it, because
the overlap window is then too short for any of it to matter.
