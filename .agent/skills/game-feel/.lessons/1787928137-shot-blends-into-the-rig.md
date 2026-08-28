---
title: An intro camera must END as the driving rig's own frame, and aim SHORT — a long lead walks the subject off the edge
date: 2026-08-28
scope: pwa/src/game/camera-start.ts, pwa/src/game/camera.ts
concepts: [camera, game-feel, framing, fov]
---

Two things the establishing shot got wrong before it got right, and both are
general to any cinematic that hands over to gameplay.

**Blend into the rig, do not animate toward a guess.** `flyStart` runs AFTER
the normal mode update in `camera.ts`, so `camera.position/quaternion/fov` are
already holding the pose the player would be driving with this frame. The shot
captures that as its destination and lerps/slerps into it over the last fifth
of the beat. The hand-over is then seamless in EVERY camera — hood included —
with no per-mode landing pose to maintain, and the last frame of the shot is
provably the first frame of the drive.

**The aim point does two different jobs and they pull against each other.**
Aim HEIGHT is what levels the lens: aimed at the car's wheels from 8-11 m up
the shot pitches down ~20° and fills its bottom half with gravel, and the
country the stage runs through never gets into frame. Aim LEAD is what the
shot is about — but the camera is off to one side, so lead swings it PAST the
subject: at 19 m ahead the player's car walked clean off the left edge of a
1280×720 frame, at 13 m it sat in the left third, at 8 m (about two car
lengths) it centres. Raise the aim, keep the lead short, and lower the camera
rather than pitching it.

Verify by LOOKING at three frames — open, mid-sweep, hand-over — not one. The
open frame is the one that exposes the pitch and the mid-sweep the one that
exposes the lead, and a single screenshot of either would have passed.
