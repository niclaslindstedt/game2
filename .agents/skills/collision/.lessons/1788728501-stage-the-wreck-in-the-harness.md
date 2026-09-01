---
title: The LOOK step for a crash is a harness scene, not a drive — `shot-crash*` in scripts/screenshot.mjs, and a heli variant to see the nose
date: 2026-09-01
scope: scripts/screenshot.mjs, pwa/src/game/car-damage.ts
concepts: [collision, damage, screenshots, harness, playtest]
---

`make screenshots` has a wreck of its own now: `shot-crash` (throttle, then
hard left off the opening straight into the treeline, shutter once the car
is under 25 km/h), `shot-crash-after` (the same wreck six seconds on) and
`shot-crash-headon` (no steering at all through the first corner, which is
where a head-on comes from — on seed 42 it kills the engine and lands the
RETIRED card). Run only those with
`CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/screenshot.mjs shot-crash`
after `make build`; the sweep is minutes, the three scenes are one.

Two things the pictures taught:

- The chase camera never sees the nose. `shot-crash-headon-heli` (`camera:
"heli"`) is the frame that shows what a head-on did, and it is also the
  only one where the engine smoke reads as a column rather than a wisp
  behind the card.
- The per-vertex buckle (`WARP` in `car-damage.ts`) is what separates torn
  from scaled, and it goes to spikes fast: at 0.8 of the fold the tail was
  a burst of white splinters, at 0.55 it is a crumpled quarter panel. Judge
  it on the tail shot, where the fold is deepest.
