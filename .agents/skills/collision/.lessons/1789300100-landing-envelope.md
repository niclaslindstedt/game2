---
title: Calibrate any new landing threshold against the BOT'S envelope — 13 m/s of slam and 17° of nose-down, and it is twenty lines to measure
date: 2026-09-08
scope: engine/game/collision.ts, engine/game/flight.ts, engine/game/defs/tuning.ts
concepts: [landing, collision, tuning-loop, measurement, jumps]
---

Anything that reads a landing — a new tolerance, a face that arrives, a load
rating — needs a floor it must not reach on an ordinary stage, and guessing
one is how a change quietly starts costing every car its engine on the
generator's own crests. The envelope is cheap to measure directly rather
than through `make sim`: step `createGame` with `botInput(state, RALLY_BOT)`
over a handful of seeds and cars, and record `car.pitch` from the step
BEFORE each `landing` event (the event carries `slam`, not the attitude).

Over eighteen bot runs (six seeds × three cars, medium stages) the whole
distribution is: hardest slam **13.1 m/s**, steepest nose-down **16.5°**,
and the most floorpan a whole run folds is about **0.03 m**. Those three
numbers are the bar. A threshold set inside them is a change to how every
stage drives; one set clear of them only fires where the player genuinely
went off a mountain, and `make sim` then comes back byte-identical, which
is the confirmation rather than the measurement.

Watch the shape of the ordinary case too, not just its peak: a jump's
attitude follows the FLIGHT PATH (`settlePitch` off `atan2(vy·lead, path)`),
so nose-down angle grows with descent over forward speed. A jump is shallow
because it carries speed; a plunge steepens to `attitude.pitchMax` because
the drag eats the forward speed on the way down. Any rule keyed on pitch is
really keyed on that ratio.
