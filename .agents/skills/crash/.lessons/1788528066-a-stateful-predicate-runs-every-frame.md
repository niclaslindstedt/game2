---
title: A predicate that also owns state must be called unconditionally — behind an `&&` it goes blind exactly when it needs to be watching
date: 2026-09-04
scope: pwa/src/game/camera-roll.ts, pwa/src/game/camera.ts
concepts: [camera, roll, hand-over, state, framing]
---

The roll shot latches itself off once the driver has caught the car, and
releases that latch when `car.planted` says the car is fully back on four
wheels. The release lives inside `watching()`, which `camera.ts` called as
`!overhead && !inCar && rollShot.watching(state)`.

JavaScript short-circuits, so the shot was never asked anything while the
player was in a cockpit view — it could not see the car come back, and it
came out of the seat still holding a latch from an accident two corners
earlier. Put the stateful call FIRST and the caller's own reasons after it:
`rollShot.watching(state) && !overhead && !inCar`. Better still, say in the
predicate's own doc that it must be asked every frame, because the next
person to add a condition will otherwise put it in front again.

Two more things this shape needs, and both were bugs before they were rules:

- **A latch has to survive the teardown that runs beside it.** `reset()` is
  called every frame the shot is not up, so anything the latch remembers must
  live outside it; the lifecycle callers (a new stage, a change of crew) get
  a separate `release()` that drops both.
- **A latch gates TAKING the frame, never giving it back.** Gate the plant on
  it and let a hand-back already in flight finish, or the "hand it back
  politely" feature ends in a cut.

And a test trap worth the same care: `tests/camera_test.ts`'s hand-back case
claimed to test a wreck's hold but never set `state.overturned`, so it had
always been measuring the save path. A fixture that writes car state directly
must write EVERY flag the code under test reads.
