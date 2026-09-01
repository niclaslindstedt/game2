---
title: Optimize the engine behind a determinism FIXTURE, not behind the test suite
date: 2026-08-28
scope: engine/
concepts: [performance, determinism, test-conventions, simulation]
---

`make test` passes happily on an optimization that has quietly moved the
physics — the suites assert ranges and behaviours, not exact numbers. Before
touching a hot path, write a throwaway fixture that hashes everything the
engine produces and diff it after EVERY individual edit, not once at the end:
a batch of five changes that comes out different tells you nothing about
which one did it.

What it has to cover, because each of these caught something the others
would not have: sim digests AND run stats AND the full event stream, over
seeds x cars x {weather, gearbox, length, circuit, dialled-up knobs};
compiled stage geometry (every sample field, the segments, the junctions)
per seed x knobs x shape; and the terrain field probed on a lattice that
straddles the corridor, the branches and the wild — `heightAt`, `groundAt`,
`roadDistanceAt`, `waterAt`, `groveAt`, `obstaclesNear`, `treesNear`. A
run-only fixture misses everything in mapgen that the car never drives over.

Keep the fixture in the scratchpad; it is a tool for the session, not an
artifact. What ships instead is a test for any optimization whose
CORRECTNESS is an argument rather than an identity — see the bounding-circle
prune in `locate` and its brute-force cross-check in `roads_test.ts`.
