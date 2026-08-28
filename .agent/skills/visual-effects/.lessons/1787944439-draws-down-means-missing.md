---
title: A draw count that FALLS after you add geometry means the geometry is not being drawn
date: 2026-08-28
scope: pwa/src/game/
concepts: [profiling, verification, instancing, silent-failure]
---

`make profile` reported 411 → 366 draws on the `driving` scene after a change
that added instanced posts and blocks to every marked corner. The number moved
the pleasant way, so it was nearly written up as "the shared geometry and
materials paid for themselves". It was not: the marker list handed to the
renderer was empty and the entire R26 marking had stopped being drawn.

Take a favourable movement in draws, triangles or binds as a QUESTION, not a
result. The honest reading of "I added meshes and the frame got cheaper" is
almost always "the meshes are missing", and the profiler cannot tell you which
— only a picture can. `make debug-shot` with a camera parked at the exact
feature (compute the pose from the engine's own placement in a throwaway
vitest case, then hand the `?gx=&gy=&gz=&gyaw=&gpitch=` line to the script) is
the cheapest way to settle it, and it is faster than a full `make screenshots`
sweep.

Note the streaming trap while framing one: at `?start=1` the world is raised a
slice at a time, so a camera parked kilometres down the stage looks at road
that has not been built yet and shows nothing either. Pick a feature in the
first few hundred metres.
