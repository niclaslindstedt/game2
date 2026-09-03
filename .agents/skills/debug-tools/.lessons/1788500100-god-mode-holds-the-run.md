---
title: God mode HOLDS the run — a repro of anything that moves on its own needs `bot=1` on the line
date: 2026-09-03
scope: scripts/debug-shot.mjs, pwa/src/App.tsx
concepts: [debug-shot, god-mode, repro, traffic, trains]
---

`?god=1` stops the simulation for as long as the camera is off the car (the
overlay says `run: held by god mode`), so a `make debug-shot` taken with a
free camera photographs the world at the instant the page opened: no train on
the line, no traffic on the public roads, a fleet that never spawned. The
`--wait` flag only waits; nothing steps.

The way to photograph a MOVING thing from a free camera is `bot=1` on the
repro line: the bot drives the run, the engine steps every frame, and the
camera stays wherever it was put. Then `--wait` is real time — a motorist
takes ninety seconds to drive in from the edge of the map, so a shot of the
far end of an arm wants a long wait, and a shot near the tape a short one.
