---
title: A/B a player-toggled renderer feature by moving its DEFAULT in settings.ts — the renderer's own initializer is overwritten before the first frame
date: 2026-08-28
scope: pwa/src/game/, scripts/profile-render.mjs
concepts: [profiling, settings, rendering, harness]
---

`make profile` drives the built app with URL params, and there is no URL param
for a HUD or video option. To measure what a toggleable renderer feature costs,
the obvious move is to flip the flag's initializer inside `renderer.ts` — and it
does nothing: `App.tsx` pushes the persisted (or default) settings into the
renderer immediately after `createRenderer`, so the initializer is overwritten
before the first frame. Both arms of the A/B then measure the feature ON, and
the two identical tables read as "this change is free".

Flip the value in `DEFAULT_SETTINGS` in `pwa/src/game/settings.ts` instead. The
profiler's browser context has no `localStorage`, so the default is what the run
gets. Rebuild between arms — the profiler serves `pwa/dist`, so a source edit
without `make build` measures the previous build.
