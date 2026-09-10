---
title: A camera MODE that becomes two rigs owes three things — the edit taken before `drawnAround` moves, the boom re-stood on the way back, and a pin for every tool that photographed the old single shot
date: 2026-09-10
scope: pwa/src/game/camera.ts, pwa/src/game/camera-tv.ts, scripts/lib/
concepts: [camera, hand-over, framing, harness, screenshots]
---

Splitting one mode across two rigs (the TV cam's tripods for the corners, the
chase boom for the road between) is three edits in `camera.ts`, and each one is
wrong in a way that looks like something else:

- **Take the edit at the TOP of `update`, before `drawnAround = state`.** A
  flown hand-over is captured from the frame ON SCREEN, and that frame was drawn
  around the PREVIOUS step's car — `change.start`'s whole contract. Decide after
  the assignment and the move opens with the lens half a metre behind, which
  reads as a flinch nobody can locate.
- **`restand = true; planted = false` on the way back to the boom.** While the
  other rig had the frame, `updateChase` was not called at all: its yaw,
  standoff, floor and springs are readings from before the corner. Eased from
  those, the flight has a destination still travelling and can only chase it.
- **Every scripted still that pinned the mode is now a coin toss.** `?camera=tv`
  used to mean one shot; it now means a director choosing. The showcase's
  trackside frames needed a pin of their own (`?tvstand=1`) — a still staged at
  a fixed seed and a fixed point has to come off the same lens every time.

Also: gate the whole block on the mode NOT being past the line. The finish
camera plants itself over everything (`camera-finish.ts`), so a director still
editing under it starts flights that get reset and leaves a stale "trackside"
flag driving the depth-of-field pass at a focal plane nothing solved.

The edit is measurable without a picture: per-frame lens displacement separates
a cut (one frame, tens of metres) from a flight (a second, never more than a
fast pan) — `tests/camera_tv_cut_test.ts`.
