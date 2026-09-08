---
title: A new stop on PLAY_CAMERAS costs two keyed records and one class of camera test — the assertions measured in the CAR's frame
date: 2026-09-08
scope: pwa/src/game/camera.ts, pwa/src/game/settings.ts, tests/camera_test.ts
concepts: [camera, settings, test-conventions, audio]
---

Adding an id to `PlayCamera` makes the typechecker name two of the three places
it has to reach: `CHASE_RIGS` in camera.ts and `LISTENERS` in
`audio/listener.ts` are both `Record<PlayCamera, …>`. A camera that is not on
the boom wants excluding from the first (`Exclude<PlayCamera, InCarCamera |
"tv">`) and a row of its own in the second.

The third place is silent, and it is the one worth knowing about before
starting. `tests/camera_test.ts` enumerates `PLAY_MODES` for a whole class of
rule — the lens is carried with the car through a view change, a respawn costs
no swing, the shot is stood where the car is rather than flown round to it —
and every one of those is measured as `camera.position - car.position`. In the
car's frame a camera standing still on a bank moves at the speed of the car, so
a fixed trackside rig fails all three by doing exactly its job. The fix is not
an exclusion in the test: it is `RIDING_MODES` exported beside `PLAY_MODES`, so
the honest subject of those rules is named once. Anything about the LADDER
itself — the order, the wrap, that a step between two driveable views is a move
and not a cut — is still every mode.

`onBoom` in camera.ts needs the same exclusion, or arriving on the boom from
the new camera never triggers the restand.
