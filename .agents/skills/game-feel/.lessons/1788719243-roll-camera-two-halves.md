---
title: A roll needs BOTH camera families changed, and in opposite directions — hold the booms, bolt the seats
date: 2026-09-03
scope: pwa/src/game/camera.ts, pwa/src/game/camera-feel.ts, pwa/src/game/camera-eye.ts
concepts: [camera, roll, game-feel, in-car]
---

"The camera doesn't know what to do when the car rolls" is two bugs with
opposite fixes, and fixing only one leaves the report standing.

The OUTSIDE rigs cannot READ a rolling car: `updateChase` tracks a blend of
nose and travel, and a body turning at 6 rad/s with the two come apart whips
the shot through a full circle while `airborne` flickers the framing. The fix
is to stop reading rather than to stop following — HOLD the framing the
accident found (`holding`): the yaw, the drift offset, the standoff and the
lens all freeze while the rig goes on tracking the car's POSITION, so the
player watches the crash from the view they were driving in. Freeze the swing
too (a rolling yaw rate is not a turn) and hand `camera-feel.ts` `driven:
false`, which holds the height and the surge where they were and eases the
bank, the pitch and the tremor out — a canted, buzzing horizon over a car
nobody is steering is the readings turning into noise.

Release on `car.planted`, never on `rolling` going false: the crash hands a
car back the moment the rotation is spent, however far over it is leaning,
and coming back then swings the shot onto a heading about to be lost again.

The IN-CAR rigs are the other way round: they were already there, and the
neck model breaks them. `rollFollow` levels the head against a camber, and
taking two thirds of a turn while the car takes a whole one slides the
interior round the lens. While `car.rolling`, hand the neck to a bolt: the
gaze becomes the car's own basis (`Euler(-pitch, heading, roll, "YZX")` times
`Ry(π)`), slerped in over a fifth of a second, the seat's aim left on top as a
local tilt.

And `car.roll` is never wrapped: a fraction of a whole turn a car carries
after going over is not zero, and the horizon stayed canted for the rest of
the run. Read `rollTilt`.
