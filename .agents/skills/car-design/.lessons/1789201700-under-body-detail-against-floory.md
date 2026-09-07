---
title: A detail that HANGS UNDER the car is authored against `floorY`, never against the valance beside it — and the tail's spare length is the collision box's
date: 2026-09-07
scope: pwa/src/game/car-styles.ts, pwa/src/game/car/fascia.ts
concepts: [fascia, exhaust, proportions, collision-box, valance]
---

`CarBodySpec` states every height absolutely, so a part is placed by picking a
number rather than by naming what it hangs off — and the wrong number reads as a
specific, nameable bug. A tailpipe authored at the rear valance's own height
(0.40 on a car with `floorY` 0.27) comes out of the MIDDLE of a painted panel
and reads as a pipe punched through the chassis. It survives the contact sheet,
because from three quarters it is a dark circle on a dark panel.

The rule: anything that belongs UNDER the car — pipe, silencer, sump guard — is
placed so its top is level with `floorY` and the rest hangs below. Then it is
visible for its whole length from the chase camera, it is the lowest thing on
the car (which is what makes the ground taking it off make sense), and it is
never inside a panel.

Two traps that follow:

- **Give the run somewhere to come FROM.** An open tube ending in mid-air under
  the floor is a mouth with nothing behind it. `buildExhaust` ends its run in a
  silencer box; keep such a box narrower than `trackHalf − wheelWidth / 2` or it
  is modelled through the rear tyres, where every sheet angle hides it.
- **The tail has almost no spare length.** `bodyHalfLength` is what
  `tests/car_geometry_test.ts` holds against `TUNING.collision.halfLength`, and
  the longest car sits within ~70 mm of it. A new proud detail at either cap
  owes `bodyHalfLength` an entry AND may need its own shorter reach authored per
  spec — the sedan's pipes stop 65 mm past the cap where the others take 120.
