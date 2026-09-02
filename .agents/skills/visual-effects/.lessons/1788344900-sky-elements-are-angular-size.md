---
title: An element in the SKY is governed by angular size and by fog, not by its model scale — take it out of the fog and place it where the camera is going
date: 2026-09-02
scope: pwa/src/game/raptor.ts, pwa/src/game/ambient-life.ts, pwa/src/game/clouds.ts, pwa/src/game/environment.ts
concepts: [rendering, fog, sky, readability, camera, ambient]
---

Two things decide whether something hung in the sky reads, and neither is how
big the model is.

**Fog.** `environment.ts` sets `new THREE.Fog(0xbfe3ff, 160, 520)` and every
default material takes it, so anything past ~500 m is pure fog colour. That is
right for the world and wrong for the sky: a bird four hundred metres out is
pale blue against blue before it is ever big enough to see. Sky elements want
`fog: false` on their material — as the sky shells already have — and then
their real horizon is the camera's own far plane, `DRIVING_FAR = 900` in
`camera.ts`.

**Angular size.** The driving camera is 60° VERTICAL fov, so on a 720-line
frame one degree is 12 px. A 4.5 m bird at 450 m subtends 0.57° — five pixels,
whatever the art is. Do the arithmetic before tuning the model: making it
bigger to be seen ends with a nine-metre bird that looks absurd the one time
it passes close.

The lever that works instead is PLACEMENT. Pitch the thing AHEAD of where the
camera is looking (pass the camera, not its position — `camera.getWorldDirection`
into a module-scoped scratch vector, `atan2(x, z)` for the yaw) at half a
kilometre, and recycle it only once it is outside the far plane. It then
arrives as a speck nobody notices arriving, grows over twenty seconds of
driving, and passes close — where four metres at eighty is thirty pixels and
the thing finally reads. Scattering it at a random bearing instead spends most
placements behind the car, recycled having never been seen.
