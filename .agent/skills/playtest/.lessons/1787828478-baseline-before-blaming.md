---
title: Before "fixing" a suspicious frame, shoot the same scene from a stashed baseline build — most of them are pre-existing
date: 2026-08-27
scope: scripts/screenshot.mjs
concepts: [harness, tooling, camera]
---

A frame showing the car half-buried in grass off-road looked like an obvious
regression from a suspension change. It was not: `git stash push -u && make
build && node scripts/screenshot.mjs <scene>` reproduced it identically on the
untouched tree. The real cause was the near ground horizon on a convex
hillside, which has always cut the car at its sills.

The check costs one build (~90 s) and is the difference between fixing the bug
and tuning numbers against a symptom that was never yours. Two things make it
cheap: the screenshot harness takes bare-word scene filters, so re-shooting one
scene is seconds; and it drives `pwa/dist`, so a stash + `make build` is the
whole setup. Rename the baseline (`mv previews/shot-x.png previews/base-x.png`)
before `git stash pop`, or the next run overwrites it.
