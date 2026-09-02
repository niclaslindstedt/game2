---
title: A `?start=1` run never passes through `startStage` — anything armed per-run has to be armed in the URL launch block too
date: 2026-08-29
scope: pwa/src/App.tsx
concepts: [harness, tooling, run-lifecycle, screenshots]
---

App.tsx starts a run in two places, and only one of them is `startStage`.
A tooling link (`?start=1`, which every screenshot scene and every scripted
pass uses) builds its `StageSpec` inside the renderer-setup effect and calls
`applyStage` directly — no `armField`, no `armGhost`, and no anything else
added beside them. A feature armed only in `startStage` is therefore present
for players and absent for every automated pass, which is exactly backwards
for a tool built to be driven by one.

Found the hard way: the run-tape recorder worked when a stage was started
from the menu and produced no SAVE button at all under `?record=1`, with
nothing in the console to say why.

The same block also calls `skipIntro` directly to land a tooling run on the
lights. Anything recording the run has to be told about that jump — it moves
the field's clock — so the recorder is armed BEFORE the skip and the skip is
written down as the driver's own cut at step 0.

A tooling run's discipline and level are settled from the URL before the
block runs (`modeFromUrl`, off `place-url.ts`): `?level=` and `?mode=` are
what give it a `levelId`, and without them everything hanging off one — the
field's run-out, the campaign block on the results card, FULL RESULTS, the
spectator mode — is absent from the link. The same block stands the run at
a moment when `?at=` asks (`placeRun`, then `placeField` for the crews), so
none of those surfaces needs a driven stage to photograph; a scene that
clicks through the MENU instead is paying a twelve-minute drive for what one
page load gives.

When adding anything per-run to App.tsx, grep for `applyStageRef.current`:
every call site is a run starting.
