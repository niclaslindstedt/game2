---
title: "The camera bumps" on a flat road is the road's CROSS-SECTION, and height and roll need different separators
date: 2026-08-28
scope: pwa/src/game/camera.ts, pwa/src/game/camera-ground.ts, engine/game/track.ts
concepts: [camera, road-surface, wheel-tracks, filtering, hood-cam]
---

R16's road is curved across its width — a crown and two wheel troughs — and
`car.y` carries all of it (`locate` adds `crossOffset`). Anything hung off
`car.y` heaves on ground with no hill in it: ~90 mm of camera travel per
crossing on every chase rig, and ~12° of body roll driving ~10° of hood
horizon rock. Players report it as bumps; there is no bump.

Reproduce on a FLAT road, not a bot lap: compile a straight, map
`elevation: 0, bank: 0`, and steer along a lateral line with a P+D controller
on `car.x` (open-loop sinusoidal steer diverges). Measure the peak excursion
from the trace's own 1.5 s moving average; a whole-run range hides the bump
in slow drift.

The two quantities need different separators, and the wrong one fails
silently:

- **Height — by SIZE.** A sweeper crosses the tracks over seconds, so no
  low-pass quick enough to leave a crest alone rejects it. Use a bounded
  backlash (`SLACK.ground` in camera-ground.ts): a datum clamped within
  `reach` of `car.y`, recovering slowly inside the band. Terrain is unbounded
  and passes 1:1, and the clamp kills the respawn case for free.
- **Roll — by TIME.** A trough tips the body about as far as the gravel bank
  ceiling: size cannot tell them apart. A bank is HELD and a track is
  CROSSED, so widen the play past both and let the recovery rate decide.

Feed the stand and the aim the SAME settled height, or the play shows as
pitch instead of heave — a rocking horizon reads long before a rising one.
The root cause is engine-side: `track.ts` probes camber over 0.5 m, narrower
than the car's track, so a car straddling a trough reads its point gradient.
