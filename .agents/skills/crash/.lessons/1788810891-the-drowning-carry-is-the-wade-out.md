---
title: The drowning's linear carry IS the wade-out escape — shortening it fails `drown_test` as a 300 s timeout, not an assertion
date: 2026-09-07
scope: engine/game/defs/tuning.ts, tests/drown_test.ts
concepts: [water, tuning, tests, seeds]
---

`TUNING.crash.drown.stopIn` (0.5 s) looks like a cosmetic "how far does it
skate" knob — the comment even says "a few metres" while the model actually
carries 12–18 m. It is not cosmetic. That carry is the run a car has to reach
ground it can drive off (`beach` / `drown.shallows`), and halving it took the
wade-out away: `drown_test`'s "driving out again" suite scanned its whole
100-seed tail without finding a shore any car could still reach.

Two things make that expensive to discover. The failure arrives as a **hook
timeout at the full `SEARCH_ALLOWANCE` (300 s)**, not as a failed assertion, so
the message names the `beforeAll` and says nothing about water; and the run
that produces it costs seven minutes where a passing one costs forty seconds.
A drown suite that suddenly takes minutes IS the signal — read it as "the
scenario stopped existing", not as a slow machine.

So: apply a change to the drowning to the axis the complaint is actually about.
The reported bug was the SPIN, and yaw and travel are separate knobs
(`slewIn`/`stopIn`) precisely because they buy different things — the yaw buys
nothing but the look of the settle, and the travel buys the escape. Widening
the fix to "all momentum" removed a designed behaviour nobody asked about.
