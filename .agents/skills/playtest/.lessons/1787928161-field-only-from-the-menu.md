---
title: Anything belonging to the campaign FIELD is unreachable from `?start=1` — the scene has to walk in through the menu
date: 2026-08-28
scope: scripts/screenshot.mjs, scripts/profile-render.mjs
concepts: [harness, screenshots, scenes, rivals, performance]
---

`armField` only runs inside `startStage`, and a `?start=1` link never passes
through it (App.tsx builds the spec and applies the stage directly). So no
tooling URL can put a rival on the road: a scene shot that way photographs the
camera move with an empty start line and looks like it worked.

`shot-campaign` in `scripts/screenshot.mjs` is the pattern — `?bot=1&splash=0`,
then `CAMPAIGN → TAIGA → HARD → <stage>` by visible text. Put anything that
needs the field in that block, including the establishing shot (the point of
which is the car in front leaving).

The same applies to `make profile`: its `scene()` helper takes URL params, but
the settle callback can click, so the `field` row walks the same path. Without
it the profiler measures a stage with no rivals on it and reports "no change"
for a change that adds cars — which is exactly the number the run was for.

Cursor for the shot's own beats: `.hud-start-shot` is in the DOM for the intro
and nothing else, and `.hud-lights` appears the moment it ends, so both ends
are `waitForSelector` rather than wall-clock — which matters here because sim
time runs at a fraction of wall time under software rendering.
