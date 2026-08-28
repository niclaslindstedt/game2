---
title: A cinematic camera driven off the engine's clock cannot answer a skip smoothly — give the shot its own progress and tell it explicitly
date: 2026-08-27
scope: pwa/src/game/camera-start.ts, pwa/src/game/camera.ts, pwa/src/App.tsx
concepts: [camera, framing, intro, start, hand-over]
---

The establishing shot read `state.t` every frame and drew its pose from it.
That is fine until the run is SKIPPED: `skipIntro` moves the clock to the end
of the intro in one step — it has to, because the field's whole stagger is paid
off against exactly those seconds — so the camera's progress jumped to 1 and
the frame CUT from a helicopter three car lengths out to a bumper's-eye view.

The fix is not to slow the engine down. Make the shot stateful: it keeps its
own `shot` progress, tracks `introProgress` while the intro really is running,
and on a skip runs the remaining sweep AND the hand-over blend to the driving
rig over its own short duration (~0.4 s) from wherever both stood.

Two traps in the wiring:

- **Do not infer the skip from the clock.** Nothing distinguishes "t reached
  `T.intro`" from "t was set to `T.intro`", so a gap heuristic is the only
  clock-side option and it is a guess. Have the caller SAY so — App calls
  `renderer.skipIntroShot()` immediately BEFORE `skipIntro`, while the phase is
  still `intro`.
- **A stateful camera outlives the run.** One `GameCamera` serves every stage,
  so the shot needs a `reset()` on `setGame`, and another when a mode that does
  not fly it takes over (the menu's drone/map), or a pending hand-over resumes
  over a frame nobody skipped from.

Photographing it needs care: `dtFrame` is clamped to 0.1 s and one
software-rendered frame is ~0.5 s of wall time, so a 0.4 s move is over inside
a frame or two and the screenshots look exactly like the cut you just fixed.
Temporarily raise the duration constant to a few seconds, shoot the sequence to
prove the intermediate poses exist, then put it back.
