---
title: Near a low chase cam, big point sprites read as glitchy squares — use many small grains, and light dust tones on dark paint
date: 2026-08-26
scope: pwa/src/game/dust.ts, pwa/src/game/car-dirt.ts
concepts: [particles, dust, dirt, readability]
---

PointsMaterial sprites are screen-square and size-attenuated: with the
chase camera at ~2 m height a 0.55 m particle a few meters away fills a
huge square of the frame and reads as a rendering bug, not spray. The fix
that worked: size ~0.22 with 2-3x the per-burst counts, and seed particles
with a fraction of the car's velocity (the wake) so plumes stream backward
instead of hanging. Same readability rule for the dirt coat: dark mud
(0x5e4a30) is invisible on saturated dark paint — a light gravel-dust tan
(0x9c7f57) is what actually reads as "dirty", capped below ~0.72 so the
livery survives.
