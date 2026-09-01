---
title: Inside the cabin every hand-wound face points INWARD, and world +x is on the LEFT of the frame — get either wrong and the mesh is silently not there
date: 2026-08-29
scope: pwa/src/game/car/
concepts: [winding, interior, cockpit, culling, mirroring]
---

Two facts about the car's frame that cost three separate silent bugs in one
pass, and neither raises an error — a single-sided face wound the wrong way
is not an error, it is a surface that is simply absent, and inside a body
that means a hole with the landscape showing through it.

**Every camera looks down the car's +z, which puts world +x on the LEFT of
the frame.** (`new THREE.Vector3(1,0,5).project(cam)` with the camera at the
origin looking at `(0,0,1)` returns a negative x — check it rather than
reasoning about it.) So `car/greenhouse.ts`'s outward cycle for a cabin panel
— −x low, +x low, +x high, −x high — reads CLOCKWISE from inside the car, and
a clockwise face is a back face. Anything laid on the inside of the glass (a
sun strip, a tint band) has to run the other way round.

The same fact decides which SIDE the car is driven from: `SEAT_SIDE` is
positive, so the driver, the binnacle and the wheel all sit at +x, and that
is the frame's left. And it mirrors any dial built in the obvious xy plane —
the sweep runs backwards and the needle ends up behind the face. Turning the
whole dial frame by π about y fixes the mirroring, the facing and the
needle's depth at once.

**Mirrored walls need mirrored winding.** A side wall, a door card or a
binnacle cheek built once and used for `side` of ±1 faces the same way on
both sides, so one of the pair vanishes. State the FACING and derive the
corner order from it (`wallX`/`wallZ` in `car/cockpit.ts`) rather than
writing corner orders by hand.

The way to catch all of this early is to look at the picture with the camera
INSIDE the car, not at a contact sheet: from outside, a missing inward face
is invisible.
