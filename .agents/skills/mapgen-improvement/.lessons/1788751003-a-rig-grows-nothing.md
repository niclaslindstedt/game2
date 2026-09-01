---
title: Anything the compiler places beside the road must gate on `followsLand`, or every synthetic rig grows it and the physics suites fail for a reason that reads as a handling bug
date: 2026-09-01
scope: engine/mapgen/compile.ts
concepts: [synthetic-tracks, test-conventions, placement, homesteads]
---

`compileTrack(seed, segments)` builds the physics suites' rigs through the
same `createCompiler` as a real stage, with `followsLand = false` and no
country. A new placement pass added to `append` runs on those rigs too
unless it says otherwise — and the first homestead pass did, so a drift
test's dead-straight 2 km rig grew a house 240 m down it with a lane of
solid trees fifteen metres off the centerline, exactly where a car in a
deep-slide test goes. Four `tests/drift_test.ts` cases failed with
assertions about slip angle and exit speed, nothing in the message about a
tree, and the base branch green.

Gate every such pass on `followsLand` (the rule the terrain and the
junction arms already follow), and when a physics suite fails on a
generator PR, run it on a worktree of `origin/main` first: a rig that
quietly acquired scenery is a suite measuring the wrong thing.
