---
title: A test that PINS a seed for a stage property fails on every generator change, and says nothing when it does
date: 2026-08-31
scope: tests/
concepts: seeds, measurement, test-conventions
---

Any change to how the route meets the public roads redraws every stage
downstream of it, so a suite that names a seed to get a PROPERTY — "seed 7 has
asphalt on it", "seed 7 has a ford" — fails with `seed 7 has no asphalt`, which
is a fact about the country rather than about the thing under test.
`tests/dirt_test.ts` did exactly that and cost three failures on a change that
had nothing to do with dirt.

The fix is the pattern `tests/roads_test.ts` already uses in `firstBranch`:
SEARCH the sweep for a stage with the property and throw only if none has it.
Cache the SEED, never the built state — callers mutate what they are handed, so
a shared state carries one test's car into the next.

Pinning a seed is right when the seed IS the subject (a determinism check, a
known repro); it is wrong whenever the test would be equally happy with any
stage that has the feature.

The same shape bites in reverse: `tests/collision_test.ts` asserted obstacle
clearance against `track.width` while `props.ts` deliberately measures against
`sample.width` (R33's wander). It passed for years because no seed had put a
stone in the band between the two, and a route change moved one there. When a
test and the code it checks compute the same quantity differently, the test is
one seed away from being wrong — read the placement code and assert what it
actually promises.
