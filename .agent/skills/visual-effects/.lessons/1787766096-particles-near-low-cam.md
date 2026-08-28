---
title: Near a low chase cam, big point sprites read as glitchy squares — shrink GRAINS, mask SMOKE, and keep dust tones light on dark paint
date: 2026-08-26
scope: pwa/src/game/dust.ts, pwa/src/game/fumes.ts, pwa/src/game/car-dirt.ts
concepts: [particles, dust, fumes, dirt, readability]
---

PointsMaterial sprites are screen-square and size-attenuated: with the
chase camera at ~2 m height a particle a few meters away fills a huge
square of the frame and reads as a rendering bug, not spray. Dust proved
it at size 0.55 (fixed to 0.22 with 2-3x counts). Seed particles with a
fraction of the car's velocity (the wake) — plus the wind, now that
state.wind exists — so plumes stream instead of hanging.

Small is the answer for anything made of GRAINS. It is not the answer for
smoke: shrinking tire smoke to 0.28 only made the squares smaller, and the
puffs stopped reading as puffs. What a big particle needs is a MASK — the
`puffy` flag on a DustStyle gives its points `puffTexture()` (textures.ts):
a lumpy three-step blob on a 16 px canvas, nearest-filtered so the edge is
made of visible pixels rather than a gradient. With that on, tire smoke
carries 0.55 without reading as a rectangle stuck to the lens, and it still
sits inside the chunky arcade look. The exhaust fumes are the trap in the
other direction: shrunk to 0.16 to dodge the square, a whole pipe's worth
of them disappeared against the road, and no spawn rate bought it back —
they are smoke, so they took the mask (`puffTexture()` on the fumes
material, size 0.55) and read immediately. Same readability
rule for the dirt coat: dark mud is invisible on saturated dark paint — a
light gravel-dust tan (0x9c7f57) is what reads as "dirty", capped below
~0.72 so the livery survives.
