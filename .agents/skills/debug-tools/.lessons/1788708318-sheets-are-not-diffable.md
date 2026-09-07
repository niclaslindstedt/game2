---
title: A rendered frame cannot be pixel-diffed — sample fixed points on the subject and shoot a control frame instead
date: 2026-09-06
scope: scripts/, previews/
concepts: [preview, screenshots, verification, harness, profiling]
---

Almost everything in a frame here is on a wall clock rather than a seed — the
clouds drift, the trees sway, rain and snow are particle pools, the contrails
age, the lightning fires when it fires. So two runs on the SAME build disagree
on 15–19 % of a `make sky` sheet's pixels (99 % on the strike row, max channel
delta 135), and on 100 000 pixels of a `make debug-shot` pair at delta 197. A
real regression and no change at all both land inside that band.

So a picture is a thing to READ, not a thing to diff — but two things ARE
comparable. `make profile`'s draws / triangles / binds, which the harness
says so itself. And, for a change confined to one object, a handful of NAMED
POINTS on that object: decode the two PNGs, sample the same twenty
coordinates on the car, and the sky's noise is simply not in the numbers.
Pair it with a CONTROL frame — the same pose under conditions where the
change must be a no-op (lamps off, for a change to what the lamps do). Zero
delta at every sampled point on the control, and delta only where the change
belongs on the others, is a proof a whole-frame diff cannot give you.

Two mechanics worth knowing when running these back to back:

- **Every harness serves `pwa/dist`.** A `make build` while a long
  `make profile` or `make screenshots` is still running swaps the bundle
  under it, and every scene it has not reached yet silently measures the
  other build. Let a run finish, or give the other arm its own worktree.
- **`make screenshots` cannot finish in a web session**, timing out at
  `atOpenRoad` (180 s) waiting for the bot, because software rendering manages
  about a frame a second. `origin/main` in a second worktree times out at the
  same scene — run it there before reading a timeout as a break.
