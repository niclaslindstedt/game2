---
title: A living thing that belongs to a PLACE and moves is built the crowd's way, never the flora's and never the birds'
date: 2026-09-02
scope: pwa/src/game/livestock.ts, pwa/src/game/crowd.ts, pwa/src/game/ambient-life.ts
concepts: [placement, instancing, animation, renderer-seam, livestock]
---

Three patterns exist for something alive in the world, and only one fits a
herd. `flora.ts` instances a shape once and never moves it (and sinks every
base 0.18 m and sways the two-sided material in the wind — a cow built as a
variant billows). `ambient-life.ts` follows the CAMERA (the lizards are
re-stood within 70 m of it) — right for a thing nobody expects to find twice,
wrong for a herd that has a paddock. `crowd.ts` is the one: an engine record
says WHERE (`Stand`, here `Paddock`), one merged `GeoBuilder` body per kind
(and per POSE — a grazing cow and a standing one are two geometries, the
animal writes its matrix into one and a collapsed matrix into the other), one
`InstancedMesh` each, a `LIVE_RANGE` gate so only the herd near the car is
animated, and an `add()` that re-allocates the meshes when a chunk brings a
new herd, because an instance nobody writes sits at the world origin.

The engine's half stops at the rectangle, the head count and the kind: where
each animal stands this second is renderer state on the renderer's clock, the
way a bird's is. Nothing about it is collided with or scored, so nothing about
it is `GameState`.
