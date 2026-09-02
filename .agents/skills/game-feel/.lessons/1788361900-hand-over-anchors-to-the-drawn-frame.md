---
title: A camera hand-over must anchor its start pose to the car of the frame it was DRAWN from — one frame late is a visible hesitation, and a test that starts recording at the press cannot see it
date: 2026-09-02
scope: pwa/src/game/camera-change.ts, pwa/src/game/camera.ts, tests/camera_test.ts
concepts: [camera, hand-over, game-feel, verification, test-conventions]
---

Any move between two camera rigs (`camera-change.ts`, `camera-sweep.ts`) holds
the pose it starts from in the CAR's axes, so both ends travel with the car.
Which car matters: a view is taken BETWEEN frames, so the pose on screen
belongs to the last DRAWN frame, and anchoring it against the car one physics
step later renders the first frame of the move at the old world point. In the
car's frame that is a jump backwards of exactly one frame of road — half a
metre at 30 m/s — and it reads as the lens hesitating as the key is pressed.
Keep the last state `update` was handed and pass its `car` into the capture;
do not anchor lazily on the first flown frame.

The same boundary defeats the test. A harness that calls `setMode` and starts
recording from the next frame measures only the flight and passes with the
flight removed — the cut lives between the last frame of the old view and the
first of the new. Record a lead-in of ten frames BEFORE the press, and assert
the worst single-frame step against the whole span (a cut spends all of it in
one frame; an eased move peaks near a twelfth). Prove the test is not vacuous
by disabling the move and watching it fail.

Two more things that only show up on a real drive: give the rigs distinct
mounts with `setEyes`, or all three in-car views sit on one fallback point and
the move has nowhere to go; and settle the view being LEFT for a couple of
seconds first, or what gets measured is its standoff still easing out.
