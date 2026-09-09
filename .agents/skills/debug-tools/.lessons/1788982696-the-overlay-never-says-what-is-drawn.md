---
title: The overlay's `ground` row is the RIDDEN surface, never the drawn one — settle any "it is above/below the ground" report by probing heights and walking the scene
date: 2026-09-02
scope: pwa/src/game/debug-info.ts, pwa/src/game/road-mesh.ts, pwa/src/game/
concepts: [repro, screenshots, terrain, renderer-seam, god-mode, verification]
---

`ground … N m up` is `terrain.groundAt`. It says nothing about what is DRAWN
there, so a repro that reproduces exactly and still looks wrong is a seam
between the two, and a still cannot tell a floating prop from a tall one
standing beyond a crest. Both directions of that seam are measured, not
eyeballed.

**Something drawn OVER the ridden surface** — a car "buried" to its window line
while the CAR box's `y` sits on the road's elevation. Probe `sample.elevation`,
`groundAt`, `latticeAt` and `heightAt` along the route at the reported
`stage-s`: lattice under the mat means the tiles are innocent. Then fly the same
seed from 150 m up and from a low oblique; the intruder's shape (a slab, a
ridge, a pad) names the module. Once it was `chunkSamples` in `road-mesh.ts`
laying a run-off apron over a circuit's first fifty metres.

**Something standing IN THE AIR.** Temporarily set `globalThis.__parts = parts`
in `renderer.ts` and `globalThis.__world = { terrain, track }` in `world.ts`,
build, and drive the REPRO line with playwright-core (copy the server out of
`scripts/debug-shot.mjs`; a script outside the repo root cannot resolve it).
Walk `__parts.scene`: an `InstancedMesh` instance's world origin is
`matrixWorld * instanceMatrix[k]`'s translation, all-zero where nobody wrote it.
Compare against `terrain.standOn` — the drawn surface, ribbon over lattice —
minus `geometry.boundingBox.min.y * scale`, which is where it RESTS. To name the
thing at a reported pixel, project every candidate through `projectionMatrix *
matrixWorldInverse` and shortlist by depth; its colour and vertex count then
`grep` to a module. Read verdicts sceptically: a crowd's head sits 1.7 m up
correctly. A whole class at one constant offset is the bug.
