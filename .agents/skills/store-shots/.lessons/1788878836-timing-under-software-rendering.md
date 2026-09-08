---
title: Software rendering costs ~10x, and the @3x shutter outlives Playwright's default timeout
date: 2026-09-08
scope: scripts/store-shots.mjs
concepts: [harness, timing, rasters, patience]
---

Measured on a four-core runner with no GPU: the simulation advances at about a
TENTH of wall time, and one full-raster `page.screenshot()` at 2868x1320 takes
longer than Playwright's 30-second default action timeout. That failure reads
as `page.screenshot: Timeout 30000ms exceeded`, which looks like a broken
harness rather than a slow machine — both drivers now pass `PATIENCE`
explicitly, and `holdFor` returns the ratio it observed so the log says which
kind of machine you are on.

Practical consequences when iterating here rather than on a real GPU:

- **Budget five minutes per 2868x1320 frame**, so a six-frame single-raster set
  is half an hour and the full three-raster set is well over an hour. Iterate
  with `--only iphone --shot <one>`; leave the set to a machine that can draw.
- **A recipe placed a corner too early does not become a slow frame, it becomes
  a timeout.** Place the car sixty to ninety metres short of the feature and
  read the distance off `make level`, never off a guess.
- **A frame driven from the grid costs an order of magnitude more than a
  placement**, because it is real road at a tenth speed. The `pack` frame was
  driven at first and is now placed at `s=150`: `placeField` brings every crew
  forward to the player's own clock, so seven seconds in the field is as
  bunched as it is on the grid, for one page load instead of two hundred
  metres of software-rendered road.
