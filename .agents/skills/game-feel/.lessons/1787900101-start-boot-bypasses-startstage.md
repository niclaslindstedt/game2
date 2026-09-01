---
title: `?start=1` boots a run WITHOUT startStage — per-run renderer state set in one place only will not appear in any screenshot
date: 2026-08-27
scope: pwa/src/App.tsx, scripts/screenshot.mjs
concepts: [tooling, screenshots, camera, verification]
---

App.tsx starts a run from two places: `startStage` (a menu press) and the
renderer-import effect's `else` branch, which is the `?start=1` path every
driving screenshot takes. The second one calls `applyStage` and nothing else,
so anything a run must APPLY at its start — the camera mode, and any future
per-run renderer setting — has to be set in both or the tool shoots whatever
the renderer happened to default to.

The failure is quiet: six camera angles all captured as the default chase,
each frame a plausible-looking game screenshot. A capture that comes back
looking RIGHT is not evidence the parameter arrived. When a scene is supposed
to differ from the default, prove the difference in the picture before
reading anything else off it — two angles that should be metres apart and are
pixel-identical is the tell.

Prefer a URL param over counting key presses for this (`?camera=<id>` beside
`?seed=`/`?tod=`): a press count silently shoots the wrong thing the day the
cycle order grows, which is exactly the day the scene was added for.
