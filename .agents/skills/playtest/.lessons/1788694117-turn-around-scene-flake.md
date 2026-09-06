---
title: '`make screenshots` fails on `shot-turn-around` about two runs in three, on unchanged main — do not bisect it into your own change'
date: 2026-09-06
scope: scripts/screenshot.mjs
concepts: [screenshots, verification, flake, test-conventions]
---

The `shot-turn-around` scene scripts a five-shuffle three-point turn and then
`waitForSelector('.hud-pace-turn', 60000)` — the wrong-way sign, which the
engine only raises with the nose past 110°, the car covering ground that way
for over a second, and the wheels still ON the road. Whether five shuffles get
a car that far is decided by where each key release lands relative to a frame
boundary, and under software rendering a frame is a tenth of a second of stage
time, so the manoeuvre is on a knife edge.

Measured on one machine: unchanged `main` passed it 1 run in 3, and a branch
carrying an unrelated camera change passed 0 in 5. It looks exactly like a
regression in whatever is in the tree, and it is not one — every run before it
in the sweep (`shot-drift`, `shot-speed`, the grid shots) had already been
written, so the shots that matter are on disk when it dies.

So: if the sweep dies there, re-run the single scene
(`node scripts/screenshot.mjs turn-around`) a couple of times and compare
against a `git worktree` at `origin/main` before spending an hour on it — and
name the scene with a filter to get the rest of the sweep past it.
