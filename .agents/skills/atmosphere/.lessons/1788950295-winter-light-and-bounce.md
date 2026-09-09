---
title: A winter frame is lit by a 5° sun and cannot be colour-judged alone — shoot the same pose in summer, and remember snow LIGHTS ITSELF
date: 2026-09-09
scope: pwa/src/game/environment.ts, pwa/src/game/terrain.ts
concepts: [winter, snow, light, screenshots, measurement]
---

At 62°N a winter noon puts the sun about five degrees up, so `hour=12` on a
taiga winter comes back with an orange sky and warm, dim ground. White snow
photographs as beige-grey in it, and half an hour was spent hunting a paint
bug that was not there: `snowAt` returned 1.000 at every probe while the
picture looked like bare earth.

Two things follow.

**Judge a winter colour against the SAME pose in summer**, not against an
expectation — one `debug-shot` per season at identical `g…=` params. The
difference (brown gravel vs grey-blue packed snow, green vs white) is
unambiguous where either frame alone is not.

**And a snowy country is lit differently, on purpose.** The hemisphere's
lower half is light coming back UP off the ground: bare country returns
about a fifth of what falls on it, snow returns most of it. That is
`environment.ts`'s `BOUNCE`, keyed off `snowCoverAt` at the country's own
FLOOR (not its peak — the bounce arrives when the low ground has gone over,
not when a summit has). Without it a winter is a beige country with nothing
lifting the shadow side of anything, which reads as a bug in the paint.
