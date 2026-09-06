---
title: The snow paint's rock windows never fully close above the line — cap the closure PAST 1, or a whole-white country is a mottled one
date: 2026-09-06
scope: pwa/src/game/terrain.ts, pwa/src/game/ground-rules.ts
concepts: [snow, paint, seasons, screenshot]
---

`paintGround` cuts windows of bare ground into the snow with a noise band:
`cover = lie × clamp((window − 0.55 + 0.55 × closed) / 0.22)`, with `closed`
the height over the snowline in `SNOW.patchFade`, clamped to 1. At 1 the
expression is `window / 0.22`, so every cell whose noise rolls under 0.22
stays bare FOREVER — a fifth of the ground, which reads as a ragged margin
right at the alpine's line and as a dirty, patched snowfield anywhere the
climate has put the line hundreds of metres under the country. The first
winter screenshot was exactly that: a white taiga with grey holes in it.

Let `closed` run to 1.4: the windows shut a hundred metres over the line
and the margin near it is untouched. The general rule: a "fade that closes
a noise window" has to be able to push the threshold past the noise's whole
range, or it only ever closes most of them.
