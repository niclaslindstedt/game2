---
title: A roll needs BOTH camera families changed, and in opposite directions — plant the booms, bolt the seats
date: 2026-09-03
scope: pwa/src/game/camera-roll.ts, pwa/src/game/camera-eye.ts, pwa/src/game/camera.ts
concepts: [camera, roll, game-feel, in-car]
---

"The camera doesn't know what to do when the car rolls" is two bugs with
opposite fixes, and fixing only one leaves the report standing.

The OUTSIDE rigs cannot follow a rolling car at all: `updateChase` tracks a
blend of nose and travel, and a body turning at 6 rad/s with its heading and
its travel come apart whips the shot through a full circle while `airborne`
flickers the framing between grounded and flying. The fix is a planted shot
(`camera-roll.ts`, the third beat beside start and finish). Three things it
needs that the finish's plant does not: a ZOOM solved from the distance
(`2·atan(frame/2d)`, clamped) or the car is six pixels by the time it stops
turning; a cap on how far the lagging pan may sit off centre, tied to the
lens it is actually drawing at, because a fixed cap in degrees lets the car
off the edge at the long end; and a PEEK — the sight line marched from lens
to car, solving at each sample for the height that clears it,
rate-limited — since a roll ends downhill of where it started more often
than not.

The IN-CAR rigs are the other way round: they were already there, and the
neck model is what breaks them. `rollFollow` (0.55–0.9) through `rollPlay`
levels the head against a camber, and taking two thirds of a turn while the
car takes a whole one slides the interior round the lens. While `car.rolling`,
hand the neck over to a bolt: the gaze becomes the car's own basis
(`Euler(-pitch, heading, roll, "YZX")` — the composition `seatAt` and
car-mesh.ts already use — times `Ry(π)` for the camera's −z), slerped in over
about a fifth of a second, with the seat's aim left on top as a local tilt.

And the same file had a latent bug behind it: `car.roll` is never wrapped, so
a fraction of the whole turn a car carries after going over once is not zero
and the horizon stayed canted for the rest of the run. Read `rollTilt`.
