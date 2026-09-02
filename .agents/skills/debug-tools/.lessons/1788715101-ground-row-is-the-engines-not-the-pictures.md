---
title: PLACE's `ground` row is the ENGINE's ground, not the drawn one — a camera "2 m up" that sees only earth means a mesh stands over the ridden surface
date: 2026-09-02
scope: pwa/src/game/debug-info.ts, pwa/src/game/road-mesh.ts
concepts: [repro, screenshots, terrain, renderer-seam, god-mode]
---

The overlay's `ground … N m up` is `terrain.groundAt` — the surface the
physics rides. It says nothing about what is DRAWN there. So a repro that
reproduces exactly (same `stage-s`, same pose, "2.0 m up") and shows nothing
but earth to the horizon is not a generator defect in the ground: it is a
drawn surface standing over the ridden one, and the engine will tell you the
ground is fine because, for the car, it is.

The tell in a chase-cam report is a car "buried" to its window line while
the CAR box's `y` sits on the road's elevation at that `s`: the physics has
the car on the mat, and something is drawn a metre over it.

Order of work that found it in one pass: (1) probe `sample.elevation`,
`terrain.groundAt`, `terrain.latticeAt` and `heightAt` along the route at
the reported `stage-s` — if the lattice is under the mat, the tiles are
innocent; (2) fly the SAME seed from 150 m up and from a low oblique off to
the side — the shape of the intruder (a level slab, a ridge, a pad) names
the module; (3) grep the renderer for whatever extrapolates or lays a plane
there. Here it was `chunkSamples` in `road-mesh.ts` drawing a level run-off
apron past a circuit's last sample, i.e. over the lap's first fifty metres.
