---
title: A shot that hands over to gameplay owns its own progress and lands on the pose the rig has ALREADY written — with the aim raised and the lead kept short
date: 2026-08-27
scope: pwa/src/game/camera-start.ts, pwa/src/game/camera.ts, pwa/src/App.tsx
concepts: [camera, hand-over, intro, framing]
---

**Own the clock.** A shot that reads `state.t` cuts the moment the run is
SKIPPED: `skipIntro` moves the clock in one step (the field's stagger is paid
against those seconds), so the progress jumps to 1. Give the shot its own
progress, and on a skip fly the rest plus the blend over its own short
duration. Never infer the skip from the
clock — nothing separates "t reached" from "t was set" — have the caller SAY
so (`skipStartShot` before `skipIntro`). A stateful camera outlives the run:
reset it on `setGame` and whenever an overhead mode takes over.

**Land on the rig, not on a guess.** The shot runs AFTER the mode update, so
the camera already holds the pose the player will drive with this frame;
capture that as the destination every frame and blend into it over the last
fifth. The last flown frame IS the first driven one, in every view. The aim
point does two jobs that pull apart: HEIGHT levels the lens (aimed at the wheels from
10 m up the bottom half is gravel), LEAD is what the shot is about, but from
off to one side it swings PAST the subject — 19 m walked the car off the
edge, 8 m centres it. Raise the aim, keep the lead short, lower the camera.
