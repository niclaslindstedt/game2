---
title: Bump stops damped in BOTH directions are why every landing squatted to the same 9 cm and never came back up
date: 2026-08-29
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [suspension, jumps, game-feel]
---

`stepSuspension`'s bump stops applied `stopDamp` off the raw `rideRate`, which
damps the spring coming back OUT of the stop exactly as hard as going in. A
rubber stop does not do that — it pushes — and the push is the whole rebound
of a landing.

The symptom is what a player reports as "the suspension didn't act": measured
across generator-legal lips (0.9–2.2 m) at 16–44 m/s, EVERY landing squatted
to the same -0.090 m and then eased quietly back to rest. A hop off a kerb and
a two-metre moon shot drew the same body movement, and the chase camera, which
rides `heave` of it, showed nothing that distinguished them.

The fix is one line — damp at full rate only while the spring is being driven
deeper (`car.rideRate * dir > 0`), and at `stopRelease` of it on the way out.
Keep the release well under 1 so it is one rebound and not a pogo: the
chassis's own `bounceSpeed`/`bounceKeep`/`bounceMax` is the capped version of
that, and the only thing allowed to leave the ground.

Worth knowing while you are in there: this makes the landing VISIBLE, not
harder. The rebound is still only ~2 cm, so it cannot carry a grip effect —
that is `CarState.settle`'s job (see the `drift-feel` lesson). And size a
landing's camera kick, dust and sound off the SLAM the `landing` event
carries rather than its air time: a short hop off a steep lip arrives harder
than a long floaty flight onto ground running away underneath it, which is
exactly the case where air time gets it backwards.
