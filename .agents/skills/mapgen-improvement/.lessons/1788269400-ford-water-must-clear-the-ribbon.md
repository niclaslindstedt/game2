---
title: Ford water must clear the ribbon before the renderer can show its channel
date: 2026-09-01
scope: engine/mapgen/terrain.ts, pwa/src/game/streams.ts
concepts: [water, terrain, renderer, plausibility]
---

The stream renderer trims each water cross-section by calling `TerrainField.waterAt`. That query must suppress water only where the actual road ribbon stands over it; suppressing it across the wider graded corridor removes the channel at the road edge and makes a full-width ford look like paint on the road. A ford’s traced half-width also needs to exceed half the road width by a visible margin. Test the rendered answer through `waterAt` just outside both ribbon edges, not only the anchor width the tracer intended.
