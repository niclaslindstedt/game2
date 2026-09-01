---
title: A camera-relative particle sheet must subtract the camera's OWN velocity, or it travels with the car
date: 2026-08-28
scope: pwa/src/game/rain.ts
concepts: [particles, rain, weather, speed, camera]
---

`rain.ts` keeps its drops in camera-relative coordinates and wraps them
inside a box that rides the camera — which is what makes the sheet endless
and allocation-free, and also what quietly parents the rain to the car. A
drop moved by wind and gravity alone stays in the same place relative to
the lens however fast the car is going, so a stage at 140 km/h looks
exactly like a parked car in a shower.

The fix is to draw each streak along the velocity it is SEEN at: the drop's
own velocity minus the camera's, with the camera's taken from its position
delta over `dt`. At rally pace that term dominates, and vertical drizzle
becomes near-horizontal tracer coming at the windscreen — which is both
correct and one of the cheapest speed cues in the game.

Two things it needs to survive: a ceiling on the believed camera speed
(`CAMERA_MAX`), because a respawn or a camera cut moves the lens hundreds
of metres between two updates and flings the whole box out of the world for
seconds; and a cap on the streak LENGTH rather than on the time it is drawn
over, or the sheet becomes a wireframe cage around the car at speed.

Also: contrast has a SIGN. A drop refracts what is behind it, so against a
bright overcast rain is darker than the sky and against a black storm it is
paler. A single authored pale grey disappears on exactly the weather with
the most rain in it — `rainTone(preset)` in `sky.ts` picks the side.
