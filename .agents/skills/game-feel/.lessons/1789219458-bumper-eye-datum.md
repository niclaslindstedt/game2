---
title: An in-car lens is stood off the car's DRAWN front, never off the profile's nose station
date: 2026-09-12
scope: pwa/src/game/car-styles.ts, pwa/src/game/car/shell.ts
concepts: [camera, bumper, car-design, clipping]
---

`carEyes` put the bumper lens a hand's breadth ahead of `profile[0].z`. That
station is where the LOFT ends, not where the car does: the bumper bar is
bolted on `depth − 0.02` past it, which on the compact is 18 cm — so the
14 cm standoff stood the lens two and a half centimetres BEHIND its own
bumper face, inside the bar, with the near plane cutting it. `bodyNoseZ`
states the drawn front once (cap, bar face, lamp pods) and both the lens and
`bodyHalfLength` read it.

The other end of the same measurement is `TUNING.collision.halfLength`: a
lens standing outside the box the car is collided as is a lens inside the
tree the car has just stopped against, so the standoff is clamped to it.
Every catalog body is held inside that box already, which makes its nose the
one place that is ahead of every panel of every car and still part of it.

And a caution about reading these frames: a bar 0.7 m out and 2 cm forward
of the lens is 88° off the axis and in NO frustum. Before believing a
picture shows a given part, work out the angle — the arithmetic is two lines
and it stops a session chasing the wrong panel.
