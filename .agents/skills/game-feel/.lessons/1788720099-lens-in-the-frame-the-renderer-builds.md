---
title: A lens on the car takes the DRAWN body's world matrix, and a frame fitted to an aperture is solved in the basis the renderer will build — restating either drops a term
date: 2026-09-06
scope: pwa/src/game/mirror.ts, pwa/src/game/camera-eye.ts, pwa/src/game/car-mesh.ts
concepts: [camera, mirror, framing, rendering, three]
---

`car-mesh.ts` poses the car in four stacked pieces — the group at
`car.y + (loft − droop)` and the heading, the body's pitch and roll, then the
chassis at `ride + droop + tremble + damage pose`. Anything standing a lens on
the car that WRITES THAT CHAIN OUT AGAIN drops a piece of it sooner or later:
`mirror.ts` had `ride` but neither `droop` nor `loft`, so over every brow and
off every landing the body rose and the lens did not, and the picture in the
glass jumped. It was invisible while the mirror looked wider than the back
window, because the error was small against the frame.

Take the matrix instead. `car-mesh.ts` hands out `mirrorFrame` (the sprung
chassis `THREE.Object3D`); `frame.updateWorldMatrix(true, false)` — three has
only POSED the car at that point, it settles world matrices at render — then
`applyMatrix4` the car-local mount and read the body's up off column 1. Every
term comes for free, damage pose and engine tremble included, and there is no
second chain to keep in step.

The same rule bites the FRAMING. A frame fitted inside an aperture (the field
that fits inside the backlight, `car/mirror-fit.ts`) must be solved against the
basis the renderer will actually build. `camera.lookAt` rebuilds across/up
about the new direction, so a frame solved as a vertical OFFSET in the untilted
tangent plane is not the frame that gets drawn, and its corners are the first
thing to slide onto the lining. Solve the tilt as a ROTATION of the whole
plane.

Both were caught by asking an INDEPENDENT question in a test — `worldToLocal`
the lens back into the chassis and expect the mount, and ray-cast the frame's
four corners at the pane's triangles. Re-running the fit's own arithmetic would
have agreed with itself.
