---
title: A camera move anchors its start pose to the car of the frame that was DRAWN — and a test that starts recording at the press cannot see the cut
date: 2026-09-02
scope: pwa/src/game/camera-change.ts, pwa/src/game/camera-sweep.ts, pwa/src/game/camera.ts, tests/camera_test.ts
concepts: [camera, hand-over, verification, test-conventions]
---

A move between two rigs holds its start pose in the CAR's axes so both
ends travel with it — and the pose on screen belongs to the last
DRAWN state, not the one a physics step later, or the first flown frame jumps
back half a metre of road and reads as hesitation. Capture against the car
of the state `update` was last handed.

Testing any of it: record a lead-in BEFORE the press and assert the worst
single-frame step over the whole span (a cut spends it all in one frame, an
ease peaks near a twelfth); a harness that starts at the press passes with
the flight removed. Prove it is not vacuous by disabling the move; give the
in-car rigs distinct mounts (`setEyes`); settle the view being left first.
To photograph a sub-second move under software rendering (~0.5 s a frame),
raise its duration to seconds, shoot open, mid and hand-over, put it back.
