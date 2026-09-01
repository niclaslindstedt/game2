---
title: Staging a crash needs swept steering, and one-off scripts need createRequire for playwright-core
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/game/car-damage.ts
concepts: [collision, screenshots, playwright, staging]
---

Two traps when driving the built app into the forest to LOOK at damage.
The forest is sparse enough (~1 trunk/500 m²) that a straight off-road
line usually threads it — after the initial swerve, alternate short
left/right taps so the line SWEEPS the treeline; the car then finds a
trunk within a few seconds and the crumple + HUD instrument can be
screenshotted over the following captures. And a one-off driving script
living outside the repo (the scratchpad) cannot `import "playwright-core"`
— module resolution follows the script's own path, so build the import
with `createRequire(join(repoRoot, "package.json"))("playwright-core")`.
