---
title: The contact yaw kick multiplies two large numbers, and `make sim` cannot see it
date: 2026-09-03
scope: engine/game/collision.ts, engine/game/defs/tuning.ts
concepts: [collision, physics, measurement]
---

`collideCar`'s lever kick is linear in the velocity change AND in the lever
arm, so the worst case is their product: a car arriving sideways at pace and
catching a trunk on its nose corner has its whole lateral speed reversed at
the full half-length of the body, and came away at 27 rad/s — four turns a
second — off one tree. It is well behaved everywhere a car actually spends
its time, which is exactly why it survived so long.

Two things worth knowing next time something in the contact model needs a
ceiling. First, `make sim` is BLIND to it: the before/after tables came back
byte-identical, because a bot never arrives at a trunk that far sideways.
The regression surface is a direct probe of `collideCar` on a crafted state
(the pattern `tests/collision_test.ts` already uses) walked across the entry
speed, not the sim table — and a test that pins only the ceiling misses the
real risk, which is a cliff one notch either side of it. Walk the entry and
assert monotonicity.

Second, the ceiling goes on the KICK, never on `car.yawRate`, or a scrape
down a rock face quietly straightens a car that was going round for reasons
of its own. `max·tanh(kick/max)` leaves every contact a car really has
untouched (a few m/s of slide into a trunk comes through within a percent of
linear) and saturates the rest. `TUNING.air.tripMax` is the same argument
already made on the roll axis, and `air.roll.yawMax` is the ceiling to match:
past a point the sideways speed folds the nose rather than turning the car,
which `dealCrush` books a few lines later.

`engine/game/limits.ts` was considered for it and is the wrong home — that
module is questions about a SPEC that the bot plans against, and nothing
plans around crash spin.
