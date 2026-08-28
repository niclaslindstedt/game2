---
title: '"The camera bumps" on a flat road is the road''s CROSS-SECTION, and height and roll need different separators'
date: 2026-08-28
scope: pwa/src/game/camera.ts
concepts: [camera, road-surface, wheel-tracks, filtering, hood-cam]
---

R16's road is curved across its width — 0.17 m of crown, two 0.14 m wheel
troughs at ±1.7 m — and `car.y` carries all of it (`locate` adds
`crossOffset` to the crown elevation). Anything hung off `car.y` heaves on
ground with no hill in it: ~90 mm of camera travel per crossing on every
chase rig, and 11.7° of body roll driving 9.7° of hood horizon rock. Players
report it as "the camera rocks over bumps"; there is no bump.

Reproduce on a FLAT road, not a bot lap: compile a straight, map
`elevation: 0, bank: 0` over its samples, and steer along a lateral line with
a P+D controller on `car.x` — open-loop sinusoidal steer just diverges off
the mat. Measure the peak excursion from the trace's own 1.5 s moving
average; a whole-run range is all slow drift and hides the bump.

The two quantities need different separators, and the wrong one fails
silently:

- **Height — by SIZE.** A sweeper crosses the tracks over seconds, so no
  low-pass quick enough to leave a crest alone rejects it. Use a bounded
  backlash: a datum clamped within `reach` of `car.y` (0.35 m covers crown,
  tracks and verge step) with a slow recovery inside the band. Terrain is
  unbounded and passes 1:1, and the clamp kills the respawn case for free.
- **Roll — by TIME.** A trough tips the body ~5° and R19's gravel bank
  ceiling is 4.9°: size cannot tell them apart. A bank is HELD and a track is
  CROSSED, so widen the play past both and let the recovery rate decide
  (0.35/s kept 94% of a sustained bank and halved the crossing).

Feed the stand and the aim the SAME settled height, or the play shows as
pitch instead of heave — a rocking horizon reads long before a rising one.

Root cause, not camera-side: `track.ts` probes camber over `probe = 0.5` m,
narrower than the car's track, so a car straddling a 1.9 m trough reads its
point gradient. Fixing it moves `slopeLat`, which the physics reads.
