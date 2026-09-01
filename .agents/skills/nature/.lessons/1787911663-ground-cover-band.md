---
title: Ground cover has to reach as far as the TRUNKS do, or the middle distance is trees standing on a lawn
date: 2026-08-28
scope: pwa/src/game/world.ts, pwa/src/game/wild.ts
concepts: [placement, ground-cover, undergrowth, review]
---

The engine's trunk field reaches 150 m from the road; the road chunk's
ground-cover scatter used to stop at 34 m. Everything between read as a
bare colour field with trees standing in it — the single most artificial
thing in a screenshot, and invisible from the start line because the
grid only shows the first 40 m. `buildScenery` now runs three bands out
to 95 m, the far one thinner per square metre (it covers eight times the
ground and a clump there is a few pixels), and `wild.ts` raised its own
per-cell attempts by the same argument.

The review lesson underneath it: judge nature from a shot taken DEEP into
a stage and OFF the road, never from the grid. Drive `?start=1` with
ArrowUp held and screenshot on the run's own clock at 15–30 s.
