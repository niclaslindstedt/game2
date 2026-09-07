---
title: A fixture that writes car state directly must write EVERY flag the code under test reads — a missing one silently measures the other branch
date: 2026-09-06
scope: tests/
concepts: [test-conventions, fixtures, crash, roll, camera]
---

Writing `CarState` directly is the right way to stage a crash — how the car
got there is not the subject. What it costs is that the ENGINE maintains a
handful of flags together and a fixture maintains only the ones it thought
of, so a test claiming to cover one branch quietly covers the other and
passes forever.

`tests/camera_test.ts` has had this twice. A case that claimed to test a
wreck's beat never set `state.overturned`, so it had always been measuring
the caught-it path. And a tumble fixture that scripts `car.rolling` without
`car.planted` releases the camera's hold the instant the rotation stops,
because `planted` — not `rolling` — is what the code reads for "the accident
is genuinely over"; the two are far apart and a car caught at forty degrees
is the second without being the first.

Before scripting a crash, read what the code under test actually reads and
write every one of them, in the engine's own relationship: `beginRoll` sets
`rolling` true and `planted` false together, `planted` comes back only once
the body is level on its springs, and `overturned` is what separates a wreck
from a save. Then assert something that would FAIL on the other branch — a
test that passes under both flag settings is not testing the flag.
