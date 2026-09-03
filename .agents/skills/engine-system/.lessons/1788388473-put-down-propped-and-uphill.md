---
title: A placed car needs its foot read first, a car propped on a wall follows the seat down, and only the DOWNHILL grade is clamped
date: 2026-09-02
scope: engine/game/car.ts, engine/game/ground.ts, engine/game/step.ts
concepts: [placement, terrain, walls, physics, takeoff]
---

Three things a lofted-body takeoff model breaks that only the whole suite
finds (`start_test`, `reverse_test`): a car PUT DOWN must have its foot read first (`plant` — the grid, a
respawn, a beaching), or the first step reads the road's cross-section as
a 7 m/s fall and lights the tyres on the line; a car PROPPED on a wall face
(seat over centre by more than `leave`) must follow the seat down, not
loft off it; and the grade's gravity is clamped only DOWNHILL — the raw
uphill slope at a wall is what stops a car nosed into a bank, and clamping
it let the car drive a metre into the face.
