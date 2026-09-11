---
title: A per-FRAME artifact cannot be seen in a web session — headless Chromium here draws about one frame a second
date: 2026-09-10
scope: pwa/src/game/
concepts: [screenshots, measurement, harness, rendering, review]
---

A complaint about how something MOVES (stepping, flicker, a jump) cannot be
reproduced or measured in this environment's browser. Chromium rasterizes
in software: a driving frame at 960×540 costs about a second, so the game
itself runs at ~1 fps and every artifact that lives between frames is gone
before it can be captured. `page.screenshot` in a loop samples at ~1.5 s,
`requestAnimationFrame` fires at the same 1 fps, and both alias anything
faster than a couple of seconds into noise.

What still works, and is better evidence anyway: compute the number the
SHADER reads, in Node, over the race clock (`scripts/lib/engine-alias.mjs`
lets a probe import `pwa/src/game/*.ts` directly). A table of "worst step
per frame, before and after" is hardware-independent and reproducible where
a screenshot burst is neither.

Stills are still worth taking — they prove nothing BROKE (a texture format
changed under the fog chunk, a uniform left unwritten). Shoot the same
seed, hour and camera before and after with a fixed wait and compare the
two by eye; `make profile` beside them says whether a pass or a bind was
added. Do not try to build a motion measurement out of them.
