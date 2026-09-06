---
title: A cloud sheet thresholded straight off fbm is a mackerel sky at every genus — cut big masses first and let detail only erode the edges
date: 2026-09-06
scope: pwa/src/game/cloud-field.ts, pwa/src/game/sky-shader.ts
concepts: [clouds, noise, sky, shaders]
---

`smoothstep` over six octaves of fbm at a coverage threshold gives a sky
of small islands whatever the layer's cell size, because the fine octaves
carry the field over and under the threshold everywhere: at noon it read
as altocumulus with a 900 m cumulus scale. The field that reads as
cumulus is `0.76 · fbm(uv, 2) + 0.24 · fbm(uv · 2.6, rest)` — the mass at
two octaves decides WHERE a cloud is, the detail only bites its edge
(`cloudField`). Two more knobs that matter as much: aerial perspective
toward the horizon at 0.00005/m, not 0.0001 (six kilometres should take a
quarter of a cloud, or a sunset sky is all horizon colour), and the
horizon band's exponent on the gradient narrowed under a low sun
(`uBand` 0.62 → 0.38), or the whole dome is painted the rim's orange.
Real altocumulus cells are a degree across, which at this resolution is
noise: the genus is drawn with cells two to three times its real size.
Judge all of it on `make sky` cut into full-size cells — the sheet scaled
to fit hides exactly the frequency that is wrong.
