---
title: `make profile` never reaches its table in a web session — the `field` scene times out walking the campaign menu, and it takes the run down with it
date: 2026-09-04
scope: scripts/profile-render.mjs
concepts: [profiling, harness, tooling, rendering, web-session]
---

In a Claude web container `make profile` meters its first six scenes
(`driving`, `cockpit`, `cockpit-storm`, `storm`, `training`, `grid`) and then
dies in the seventh:

```
page.waitForFunction: Timeout 120000ms exceeded.
    at racing (scripts/profile-render.mjs:194)
```

That is `field`, the scene that walks CAMPAIGN → TAIGA → HARD → Loggers' Run →
START and waits for the clock to tick. The table is printed only after every
scene, so the whole run yields NOTHING — twenty minutes for six
"N frames metered" lines and a stack trace. Reproduced identically on a clean
`origin/main` worktree, so it is the harness, not the change under test.

What this costs a session: `make profile` is named as REQUIRED before and after
any rendering change, and here it cannot discharge that. Two things follow.
Budget it as a twenty-minute job that will probably fail, and start the BEFORE
run early — before the first edit — because you learn nothing from it until it
is over. And when it does fail, say so in the PR rather than implying a table
was read: for a change that adds no draw call, no material and no per-frame
triangle (an extra shared geometry, say), the structural argument is the honest
verification and `make profile` would not have moved anyway.

The partial output is still worth reading — the per-scene "N frames metered"
counts appear as they go, and a change that made a metered scene much slower
would show up there. Expect ±2 frames of noise between runs of one build.
