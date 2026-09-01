---
title: An in-car view reads as ROCKY from aliasing and hard clamps, not from too much amplitude — lower the frequency and soften the limits
date: 2026-08-28
scope: pwa/src/game/camera.ts
concepts: [camera, hood, game-feel, grain, aliasing, frame-rate]
---

"The hood cam is too rocky" is almost never a request for less travel — cut
the amplitude and the road stops being felt while the picture stays just as
rough. Three mechanisms, all in `updateHood`, and each one is worth more than
any amount of turning `GRAIN.heave` down:

- **The frequency ceiling is a frame-rate budget.** `GRAIN.freq`'s top
  oscillator at 11.3 Hz is five samples a cycle at 60 fps and under three at
  30: the picture stops resolving the wave and starts resolving the sampling,
  which is not a rougher road, it is a rougher PICTURE. 8 Hz is the practical
  ceiling for a game played on phones. Dropping frequency at the same
  amplitude keeps the visible travel and halves the violence — jolt goes as
  f², so 11.3 → 7.9 Hz is a 50% cut for free.
- **A `clamp` anywhere on the camera's path is a knock.** The neck's travel
  limits were clamped, so a landing threw the head into the limit at speed
  and stopped it dead inside one frame. A step in velocity is the single
  biggest jolt the view had (p99.9 heave 130 → 96 m/s² from this alone).
  `soften(v, lim) = lim * tanh(v / lim)` costs nothing where the head
  actually lives and never arrives at a wall.
- **Grain must SATURATE with pace and surface, not scale.** There are springs
  between the road and the seat: they take most of it and work harder the
  rougher it gets. `soften((speed / pace) * surface, paceMax)` instead of
  `min(...) * surface` halves the shake on off-road stages while leaving
  gravel-at-pace alone. What the springs did pass on is `car.ride`, which the
  neck already rides — that is what keeps uneven ground felt.

Damping the neck's VERTICAL axis harder than its lean axes (0.58 against
0.62/0.58) follows from the same reading: vertical is the axis the road feeds
continuously, so a ring there adds a second bump to every real one.
