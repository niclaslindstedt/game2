---
title: Stopping the frame loop leaves the HUD's start-line furniture standing over the middle of the picture
date: 2026-08-30
scope: pwa/src/App.tsx, pwa/src/game/hud-clock.tsx
concepts: [hud, harness, screenshots, tooling]
---

The HUD is not drawn off `GameState` — it is drawn off two things the frame
loop WRITES each frame: `readLive(liveRef.current, state)` every frame, and
`setSnap(takeSnapshot(…))` twelve times a second. Any early return that skips
a frame's simulation skips those writes too, and the HUD then shows whatever
was last written rather than the run's actual state.

Two instruments make that visible in exactly the frame a god-mode capture is
of. `StartLights` (`hud-clock.tsx`) reads `live.phase`, so a run held from its
very first frame — a `?god=1` link — keeps the `intro` it was created with and
prints **START CONTROL / THROTTLE TO SKIP** across the middle of the shot
forever. Fix that by writing the readouts under the hold, and the next state
does the same thing: `gantry()` returns `GREEN` while `phase === "racing" &&
time < 1.1 s`, and a held clock never passes 1.1 s, so three green lamps hang
there instead. The gantry had to come off the HUD outright while the camera is
flying (`flying` prop), the way the renderer already takes down the way-home
arrow in the free camera.

So: when a change stops or slows the loop, look at the built app before
believing it — anything the HUD holds is an aid for somebody DRIVING, and
under a free camera nobody is.
