---
title: `npx tsc --noEmit` does NOT cover pwa/src — the app has its own project and its own pass
date: 2026-09-09
scope: pwa/
concepts: [typecheck, gates, harness]
---

The root `tsc --noEmit` typechecks the engine, the tests and `scripts/`, and
it says nothing at all about `pwa/src`. The app is a separate project, and
`npm run typecheck` runs BOTH (`tsc --noEmit && npm run typecheck --workspace
pwa`).

A session that edits a renderer module and checks only the root pass gets a
clean bill and then a failed `make build` — the pwa pass is the first thing
`make build` runs, so the failure arrives after the wait rather than during
the edit loop. It cost a whole build cycle on a one-word name.

Mid-loop, on any change that touches `pwa/`, run
`npx tsc --noEmit -p pwa/tsconfig.json` beside the root one, or just
`npm run typecheck:only` for both.
