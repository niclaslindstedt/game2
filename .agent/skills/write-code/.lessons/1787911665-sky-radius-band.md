---
title: The sky's layers live in one radius band — a horizon ring inside the cloud ring slices the clouds into stripes
date: 2026-08-28
scope: pwa/src/game/environment.ts
concepts: [rendering, three, environment, sky, draw-calls]
---

Everything camera-locked in `environment.ts` is ordered by RADIUS, and
the band is narrow: the dome is at `DOME_RADIUS` (560, `depthWrite:
false`, so it occludes nothing), the ridge rings are opaque and must sit
inside it, and the clouds must sit beyond every ridge. Put a ridge inside
the clouds' orbit and it draws through them — which shows up as a cloud
sliced into horizontal stripes at the horizon, easy to mistake for a
texture bug. A cloud's own `reach` counts too, not just its ring radius.

Clouds are placed by an elevation ANGLE (`y = radius * fraction`) rather
than a flat altitude, so pushing the ring out does not drop them onto the
skyline; their drift is angular, so distance does not change how fast the
weather crosses the sky.

The rings are also one MESH, not one per ring: their per-ring haze and
tone are baked into vertex colours on `apply()` (which only runs when the
conditions change), so the whole horizon costs the frame a single draw
and adding a fifth range is free.
