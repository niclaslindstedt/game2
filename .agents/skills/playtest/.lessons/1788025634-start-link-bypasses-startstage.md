---
title: A ?start=1 link never passes through startStage — anything a run needs armed has to be armed again in App.tsx's renderer-landed branch
date: 2026-08-29
scope: pwa/src/App.tsx, scripts/screenshot.mjs
concepts: [harness, tooling, scenes, staging, field]
---

Every scene the screenshot harness drives opens on `?start=1`, and that path
builds its own `StageSpec` inside the renderer-landed effect rather than calling
`startStage`. So none of what `startStage` arms happens by itself: the field
(`armField`), the ghost, the tape, and the player's grid slot each have to be
armed in that branch too. A scene that needs rivals on the road gets an empty
stage otherwise, with no error anywhere.

Two things about that branch bite once you do arm a field there:

- **The intro skip has to advance the field with it.** `?start=1` calls
  `skipIntro(state)` directly to land on the lights; the frame loop's own skip
  pairs it with `advanceField(field, jumped)`. Drop the pairing and the player
  starts a mass-start race ten seconds up the road on fourteen crews still
  sitting through a ceremony — a "race" whose whole order is wrong, and which
  looks like a bot regression rather than a boot-path one.
- **The discipline is decided before the effect runs.** `runRef.current.mode`
  is the `run` state's initial value, so a `?mode=` reader has to feed that
  initialiser; setting the mode later is after the branch has already gone.

Only one of the two paths is exercised by playing the game, so a change to
`startStage` that a person never notices is what silently breaks every scene.
