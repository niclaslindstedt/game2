---
title: A staging at the wheel basin with no rotation is handed back before the roll's term is ever asked — test a pedal at its own seam
date: 2026-09-05
scope: tests/roll_control_test.ts, engine/game/roll-contact.ts
concepts: [roll, test-conventions, measurement, scenarios, input, weight]
---

`roll_control_test`'s crossed-up brake staging stood the car at 0.8 of the
basin with `rollRate` 0 and stepped it for half a second. On the first step
`stepRolling` handed the car back — tyres down, rate under `rest`,
`goesOver` false for a rate of exactly zero — so all forty-nine steps that
followed were the HANDLING model's, and the pass was the springs' brake. It
went red the moment the saloon's own weight sat its patch 7 cm behind the
weight: the ground's friction then spun a dead-sideways body a few
thousandths of a rad/s one way, the weathervane took that as its cue, and
which way the nose came round decided more about the speed left than the
pedal did.

Two rules from it. **A body dead sideways at the basin is a knife edge in
two axes at once** — the roll and the yaw — and no half-second claim staged
there survives a change to the weight, the inertia or the friction. And
**test a term at its own seam**: `driveRolling` is exported now, and one
call with `u = 0, w = 14, brake = 1` says exactly what the test wanted to
say (a real share of the patch spent, off `w`, none of it into `u`) with
nothing chaotic between the pedal and the assertion.

The steer stagings moved the same way: the 2.2 rad/s default the trip used
was already "marginal" in this skill's own lessons, and the saloon's weight
carried a hand higher tipped it past catching. 2.6 is the case a driver can
still catch; 3.4 is past catching; stage claims about the driver between.
