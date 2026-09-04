---
title: Stage a crash claim on a COMMITTED trip, never on a body balanced at the basin — and do not expect a brake to brake
date: 2026-09-04
scope: engine/game/roll.ts, tests/
concepts: [roll, measurement, scenarios, test-conventions, probes]
---

**A body stood at `WHEEL_BASIN` with `rollRate` 0 is a knife edge.** It sits
exactly at its own tipping point, so the outcome is decided by whatever is
smallest — the same fixture rocked back through level and out to −77° with NO
input at all, and every input then read as "changes everything". Claims made
there are noise. Stand a committed trip instead: a lean inside the basin, real
sideways speed (~8 m/s), and a rate that will actually carry the body over its
own sill corner — 2.2 rad/s is itself marginal and rocks back, 3.4 commits.

**And do not measure a brake as retardation, or as a shorter roll.** A body
already sliding has the ground dragging at the WHOLE of the patch's budget in
the direction it is travelling, and no pedal can ask for more friction than
the patch has — so over a half second the brake and a coasting crash shed the
same speed. The roll's LENGTH is the same trap one level up: "the brake takes
0.4 s off it" was measured at one staging, and swept over ninety trips on the
build it was written against, the brake moved a roll's length by a hundredth
of a second. A rollover is chaotic enough that ANY single staging shows a
pedal doing something, half the time the opposite of what it does. Sweep
`over` × `rate` × `w` and assert the mean. What survives: the throttle
lengthens the accident by about four tenths, and the brake ends one accident
in ten the right way up instead of lying there.

Two timing traps in the same fixtures. A roll has no length the model will
commit to in advance, so run one to its own end, never for a clock — but not
past `roll.lieFor` after it, or a wrecked car's state is a fresh car's on the
road. And `car.rolling` going false is not the car being level: the hand-back
happens at whatever angle the tyres came down at.
