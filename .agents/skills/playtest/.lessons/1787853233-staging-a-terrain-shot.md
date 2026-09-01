---
title: To screenshot a specific piece of terrain, probe the terrain field offline for the seed and offset first — blind key presses will not find a mountain
date: 2026-08-27
scope: scripts/screenshot.mjs
concepts: [preview, harness, terrain, tooling]
---

A scene that has to happen ON a particular kind of ground (bare rock, a high
plateau, a shoreline) cannot be found by driving off the road and hoping. Probe
for it first with a throwaway node script —
`compileStage(seed, "medium")` + `createTerrain(track)`, then walk samples and
lateral offsets asking `terrain.groundAt` what is out there — and pick the seed
where the feature sits within the first ~50 m of the stage, so the scene is a
few seconds of driving instead of a minute of luck.

Two things that cost iterations here:

- **Screen-right is the engine's left.** The chase cam mirrors the map view, so
  a probe that reports "60 m along the sample's right axis" is `ArrowRight` in
  the scene.
- **A face the car cannot climb is not a shot.** A near-vertical wall stops the
  car dead at its foot, on the turf, with no cloud at all; ~38° with a run-up
  gets the wheels onto the rock still driving. Speed before the turn is the
  part that makes it work.

Land the frame with `atStageTime(page, off + n)` counted from the verge
crossing, and expect to walk `n` a second at a time: the ground under the car
changes several seconds after the HUD says RETURN TO TRACK.
