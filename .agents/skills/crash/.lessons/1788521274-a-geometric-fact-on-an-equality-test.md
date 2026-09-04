---
title: A geometric fact decided by an exact-equality test is dead code — and it fails silently, in the safe direction
date: 2026-09-04
scope: engine/game/roll-hull.ts, engine/game/roll.ts, engine/game/step.ts
concepts: [roll, contacts, geometry, measurement, probes, debugging]
---

`standingOn` decided which hull points were "on the plane" by taking every
point within **one millimetre** of the lowest. A face is METRES long, so that
asks a four-metre roof to be within a hundredth of a degree of the ground
before it counts as being on it. Measured over five crash scenarios: a whole
face was down in **one step out of nineteen hundred**.

Three separate behaviours were gated on it and all three were dead:

- the span the normal force may shift within (`spanAcross`/`spanAlong`), which
  is the only thing that answers the friction's toppling moment — so a car
  sliding squarely on its roof tumbled end over end, which the module's own
  comment says it added the span to prevent;
- `sliding`, the ROLLING/SLIDING split the camera and sound read;
- the roll's own settle exit — so a car that came to rest off its wheels was
  never handed back, never marked `overturned`, and the crew were never taken
  to the board.

**None of it errored.** Every symptom read as a different physics bug, and
the tuning knobs all did something, so it stayed hidden through a whole
rewrite.

The same shape was in three more places at once, and it is worth going
looking for by name: **an attitude is two angles, and anything that reads one
of them is guessing.** `onItsWheels(car.roll, 0)`, `WHEEL_BASIN` in the tests
and labs, and the crash lab's "on its wheels" all threw the pitch away — a
body at roll 0 / pitch 180 is on its ROOF and read as upright, one at half a
turn of both is on its TYRES and read as overturned.

The fix in both cases is the same move: **ask the question at the scale it
lives at.** A face's tolerance is an ANGLE, not a height. Which way up a car
is, is the composition of its angles, not one of them.
