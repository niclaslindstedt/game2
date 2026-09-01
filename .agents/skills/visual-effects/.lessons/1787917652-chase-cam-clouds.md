---
title: From a chase camera a cloud left at the car is gone in a third of a second — emit at the wheels, kick it backward, fade it off the lens
date: 2026-08-28
scope: pwa/src/game/plume.ts, pwa/src/game/dust.ts
concepts: [particles, dust, camera, readability, smoke]
---

The chase rig sits ~6 m behind the car and travels at the car's speed, so
anything left behind recedes at the difference. A cloud carrying 0.55 of
the car's velocity crosses the 4 m between its birth point and the lens in
about a third of a second at rally pace — so a plume is not something the
player watches drift away, it is a thing that boils up at the wheels and
washes past. Three consequences, all learned the expensive way:

- **Emit at the CONTACT PATCHES.** A tyre is the only part of the car
  touching the ground; a cloud emitted from a point behind the boot reads
  as smoke coming out of the car. `AXLE` in dust.ts is the one answer every
  ground-contact effect shares — the grit, the plume, the landing thump.
- **Kick it backward out of the arch.** Dust born under the car and merely
  drifting back at `(1 - follow) × u` is alongside the bodywork long enough
  to be painted across it, which is unreadable and is what stops a
  front-wheel-drive car raising its cloud from under its own nose. A
  birth-time shove backward in the car's frame clears the tail before the
  puff has finished swelling.
- **Fade by view-space distance.** `-mvPosition.z` in the vertex shader,
  smoothstepped, is what keeps a two-metre puff from becoming a grey wash
  over the whole frame as the camera runs into it.

And there is a ceiling on density that has nothing to do with taste: past
it the cloud stops fanning out BEHIND the car and starts closing OVER it,
because the wheels are under the car's own outline from behind.
