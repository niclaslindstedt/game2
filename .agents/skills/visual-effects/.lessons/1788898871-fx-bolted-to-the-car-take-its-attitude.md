---
title: An FX anchored to the CAR must be placed off its full attitude — a heading-only offset is a car's height wrong the moment it goes over
date: 2026-09-08
scope: pwa/src/game/renderer.ts, pwa/src/game/field-cars.ts, pwa/src/game/car-anchor.ts
concepts: particles, fumes, crash, conventions, camera
---

Every effect that leaves the car from a FIXED PLACE on it — the exhaust off
each tailpipe, the steam off the engine bay — was written as
`c.x - fwd * back + right * side, c.y + up`. That is the car's heading and
nothing else, and it agrees with where the part is DRAWN only while the car is
level.

`car-mesh.ts` composes heading → roll → pitch about an origin on the
wheel-contact plane under the car's middle, and a car that is over is held a
hull's height in the air by its own shell (`rollStand`) — so its floor sits
ABOVE that origin instead of below it and its right-hand pipe is out to the
left. The exhaust came out 0.395 m over the highest metal on an inverted car,
on the wrong side: a plume hanging beside a wreck it never touches.

`bodyOffset` in `car-anchor.ts` is the one place that composition lives; pass
it a `{along, across, up}` point and it hands back the world offset. Use it for
anything bolted on, and aim a directional effect through it too (a pipe's axis
is `{along: -1}`, unchanged by roll, tipped by pitch).

The wheel clouds are the OTHER answer to the same question and already have
one: they spawn at axles that are in the air once the car is over, so the
crash path (`crash-throw.ts`'s `crashContact`) throws from the corner of the
shell that is actually down instead. Deciding which of the two a new effect
wants is part of adding it.
