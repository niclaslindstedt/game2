---
title: A camera's CANT is not the angle between its up and the world's — that reading is mostly the rig's own pitch
date: 2026-09-06
scope: tests/camera_test.ts, pwa/src/game/camera.ts
concepts: [camera, measurement, test-conventions, roll, framing]
---

Asserting "the horizon stays level" with
`up.applyQuaternion(cam.quaternion).angleTo(new Vector3(0,1,0))` measures the
wrong thing. `lookAt` builds its basis against WORLD up, so a perfectly level
shot pitched down at the car carries that whole pitch in the angle: `chase`
reads 0.118 rad (6.8°) with zero roll in it, and a test written that way
fails at any sane tolerance while telling you nothing about cant.

The roll about the lens's own view axis is what you want, and
`tests/camera_test.ts` already has it in `driveAcross`:

```ts
Math.atan2(up.x * dir.z - up.z * dir.x, up.y); // dir = cam.getWorldDirection()
```

That reads ~0 for any level rig at any pitch, and past 1 rad for a cockpit
going over with the body — which makes it the one measure that can state the
outside/in-car split as a single assertion. The world-up angle is only the
right reading for a near-level lens, which is why the in-car cases get away
with it.
