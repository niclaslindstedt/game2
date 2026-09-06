---
title: The preview contact sheets cannot be pixel-diffed — a sheet's own run-to-run noise is as big as a real change
date: 2026-09-06
scope: scripts/, previews/
concepts: [preview, screenshots, verification, harness, profiling]
---

Two runs of `make sky` on the SAME build disagree on 15–19 % of pixels (99 %
on the strike row), max channel delta 135. So a before/after pixel diff of a
contact sheet says nothing: a real regression and no change at all both land
inside that band. The sheets move because almost everything in them is on a
wall clock rather than a seed — the clouds drift, the trees sway, rain and
snow are particle pools, the contrails age, and the lightning fires when it
fires.

The consequence is that a sheet is a thing to READ, not a thing to diff.
Verify a rendering change by looking at the picture and by an argument about
the arithmetic; do not build a diff gate on top of one, and do not read a
diff that somebody else built as evidence either way.

What IS comparable across builds is `make profile`'s draws / triangles /
program and texture binds, which the harness says so itself.

Two mechanics worth knowing when running these back to back:

- **Every harness serves `pwa/dist`.** A `make build` while a long
  `make profile` or `make screenshots` is still running swaps the bundle
  under it, and every scene it has not reached yet silently measures the
  other build. Let a run finish, or give the other arm its own worktree.
- **`make screenshots` cannot finish in a web session.** It times out at
  `atOpenRoad` (180 s) waiting for the bot to reach open road, because
  software rendering manages about one frame a second. `origin/main` in a
  second worktree times out at exactly the same scene — run it there before
  reading a timeout as a break.
