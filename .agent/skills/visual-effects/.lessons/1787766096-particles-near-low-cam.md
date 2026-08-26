---
title: Near a low chase cam, big point sprites read as glitchy squares — use many small grains, and light dust tones on dark paint
date: 2026-08-26
scope: pwa/src/game/dust.ts, pwa/src/game/fumes.ts, pwa/src/game/car-dirt.ts
concepts: [particles, dust, fumes, dirt, readability]
---

PointsMaterial sprites are screen-square and size-attenuated: with the
chase camera at ~2 m height a particle a few meters away fills a huge
square of the frame and reads as a rendering bug, not spray. Dust proved
it at size 0.55 (fixed to 0.22 with 2-3x counts); the exhaust fumes
re-proved it at 0.26 (fixed to 0.16, slower idle rate). Seed particles
with a fraction of the car's velocity (the wake) — plus the wind, now that
state.wind exists — so plumes stream instead of hanging. Same readability
rule for the dirt coat: dark mud is invisible on saturated dark paint — a
light gravel-dust tan (0x9c7f57) is what reads as "dirty", capped below
~0.72 so the livery survives.
