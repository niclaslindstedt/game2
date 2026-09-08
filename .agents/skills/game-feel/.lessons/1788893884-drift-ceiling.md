---
title: A per-car camera calibration is almost always a SATURATION in disguise — one softened ceiling frames three drivetrains alike without the camera learning what a drivetrain is
date: 2026-09-08
scope: pwa/src/game/camera.ts, pwa/src/game/camera-eye.ts
concepts: [camera, drift, framing, car-tuning, drivetrain]
---

"The RWD car looks too sideways and the FWD is fine — calibrate the camera per
car" is a real complaint with a wrong fix. Scaling `driftWeight` by the
layout's `TUNING.drivetrain[].depth` makes a rear-driver at 10° of slip look
LESS sideways than a front-driver at the same 10°: the same slide, two
pictures, for a reason the player cannot see. It also couples `camera.ts` to
the roster, which nothing else in it is.

`soften(slip · driftWeight, driftMax)` (the tanh ceiling from camera-eye.ts)
does the job the per-car table was reaching for. It is linear where the cars
agree and only compresses where they diverge, so the calibration falls out of
the shape: measured off `npm run drift -- --table`, flick peaks of 29.6°
(FWD), 24.3° (AWD) and 40.7° (RWD) frame at 14.4°, 13.4° and 15.5° with a 16°
ceiling — a 1.7:1 spread down to 1.16:1 — while an everyday 10° slide loses
half a degree. A car added to the catalog is calibrated already.

Two things to get right. Exempt the AIR: airborne the framing follows the
travel whole, because the shot's job over a jump is the landing and a capped
aim points beside it. And do not measure this off `make sim` or `make views` —
the bot barely drifts (p99 slip ≈ 8°, max 25° over six seeded stages), so a
bot-driven contact sheet cannot show the change at all. Script the slip
straight onto `car.u`/`car.w` and read the lens's own yaw against
`car.heading` (`framedDrift` in `tests/camera_test.ts`); the camera only ever
reads state, so that is the whole instrument.
