---
title: A drift is felt as a brake when lateral grip DELETES sideways speed — redirect it instead
date: 2026-08-26
scope: engine/game/
concepts: [drift, grip, speed, sega-rally]
---

Damping `w` toward zero (`w *= exp(-latRate·dt)`) destroys energy at
`latRate · V · sin²(slip)` — at a 30° slide with `driftLat` 2.0 that is
nearly HALF the car's speed per second, so every corner reads as pulling the
handbrake, and no amount of camera or FX work hides it. The arcade contract
is that the tires REDIRECT the car: relax the slip ANGLE toward the nose
while keeping `hypot(u, w)`, and take out only an explicit scrub term
(`T.grip.scrub · sin²(slip)`, ~0.5/s) as the real loss. Two related traps
once the speed stops dropping: the HUD speedo must read ground speed
(`hypot(u, w)`) or the needle still dips every time the nose swings, and the
sim's `avg pace` barely moves either way — the regression surface for this
is the speed a scripted held slide keeps, not the table.
