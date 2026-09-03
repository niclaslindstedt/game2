---
title: Run the headless captures ONE at a time — two software-rendered Chromiums on this box time out every HUD-clock wait
date: 2026-09-03
scope: scripts/screenshot.mjs, scripts/profile-render.mjs, scripts/item-preview.mjs
concepts: [harness, tooling, playwright, timeouts]
---

The web session's container has four cores and no GPU: a driving page is
software-rasterised and the sim advances at a fraction of wall time. One
capture at a time gets there; `make screenshots`, `make profile` and a
scratch drive script launched together each starve the others, every
`waitForFunction` on the stage clock runs out (300 s on the profiler, 60 s
on `racing()`), and all of them fail together looking like a bug in the
build. `make items` is the exception — it renders a still and is cheap.

Chain the captures in one detached shell instead
(`setsid nohup bash -c '…; …' > log &`) and read the log as each lands. A
before-measurement wants a second worktree (`git worktree add ../base
origin/main`, symlink `node_modules`, `make build` there), run in the same
chain AFTER the after-run rather than beside it.
