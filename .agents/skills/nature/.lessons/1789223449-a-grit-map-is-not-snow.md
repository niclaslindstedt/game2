---
title: The ground's detail map is a GRIT texture — give it to a surface the camera gets close to and the surface reads as gravel
date: 2026-09-12
scope: pwa/src/game/textures.ts, pwa/src/game/snow-shader.ts, pwa/src/game/terrain.ts
concepts: [materials, terrain, snow, textures, review]
---

`detailTexture()` is authored for the ground TILES: a white field flecked
with warm greys, whose job is to put a grain between lattice corners
fourteen metres apart. It is calibrated for that distance, and the
calibration is invisible because at a hundred metres a fleck is well under a
pixel — all it does is stop a big colour field reading as plastic.

Hand the same map to a surface the camera stands two metres from and the
flecks are the size of a hand. On grass that is fine. On SNOW it is not: a
scatter of warm specks over white is what dirt looks like, and giving the
snow coat the tiles' map to match their grain made the ground under the car
read as wet gravel. The tone was barely touched (166 → 166) — it was
entirely a texture and hue failure, and the measurement that caught it was
`R − B` and a local-variance number, not the mean.

The rule: a detail map belongs to a material CLASS and a viewing distance,
not to "the ground". Where two surfaces must share a grain across a seam,
share it reshaped for whichever is closest — snow takes it at about a third
depth with its hue thrown away (luminance only), which is a neutral sparkle
in the surface rather than dirt lying on it.
