---
title: A body placed by height alone appears to spin about a bar under itself — the pivot has to WALK
date: 2026-09-03
scope: engine/game/roll.ts
concepts: [roll, camera, physics, game-feel]
---

`roll.ts` placed the rolling car by correcting `car.y` with `hullStand(tilt)`,
so the lowest corner of the hull sat exactly on the ground at every attitude.
Vertically correct, and it still looked wrong — the player's words were "as if
the car is holding onto a bar that's below the car, and spinning around it".

The missing half is horizontal. Turning about a corner a metre out from the
middle of the car carries the whole car sideways; correcting only the height
leaves the body rotating about a fixed point under its own middle. The walk per
radian is exactly `hullStand(tilt)` (zero flat on the wheels, widest up on a
corner), and it comes to about two metres per half turn.

The general lesson: **whenever a body is placed by solving for one axis of a
contact, check whether the contact constrains the others too.** A height-only
solve is the default mistake because it is the one that stops the object
sinking into the ground, which is the bug anybody notices first.

The second half of the same complaint was that the roll was CLEAN. The hull the
roll turns on is a cross-section with no length in it, so nothing in the model
could pitch or yaw the car; `car.pitch` was pinned to 0 and `yawRate` damped
away. Contacts now throw all three axes (`air.roll.pitchKick`/`yawKick`), which
is what real rollovers do — a vehicle is already sliding and rotating when it
trips, and "corkscrew" is one of the standard rollover test names.

`make roll` was written for this and is the only way to see it: a stack of
outlines in one place versus a car walking across the picture.
