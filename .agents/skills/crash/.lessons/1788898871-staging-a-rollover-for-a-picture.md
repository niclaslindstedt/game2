---
title: Hunting a rollover by driving a stage wastes a session — the roll lane exists, and the debug overlay is a closed-loop cursor to it
date: 2026-09-08
scope: scripts/screenshot.mjs
concepts: crash, screenshotting, repro, measurement
---

Needing a PICTURE of a car on its roof (an FX placed on the shell, a wreck's
look), the obvious move is to drive a stage flat out and turn. It does not
work: over a dozen seed-and-input combinations only one rolled, and that one
slid into a lake both times, because the terrain that trips a car is usually
the terrain beside water. Flicking the wheel to provoke a trip is worse — the
car never reaches the speed a roll needs.

Two things make it cheap instead:

- **The roll lane (R1) on the training ground is the designed answer**, and
  `?mode=training&start=1` reaches it without the menu. Get sideways before the
  yellow line and the rail puts you over, in the same place every run.
- **`?debug=1` is a machine-readable cursor.** The overlay's rows are DOM —
  `.debug-row[data-k="xyz"] .debug-row-v` is the car's position,
  `data-k="attitude"` its heading and roll, `data-k="vel"` its speed — so a
  driver script can steer toward a target with a proportional controller and
  fire the shutter on a predicate instead of a timeout. Wrap the heading
  first: it is printed UNWRAPPED (a spun car reads -1151°), and a controller
  fed that value spins the car in the other direction.

Remove the overlay before the shutter (`document.querySelector('.debug-hud')?.remove()`)
or it covers the frame it was there to find.
