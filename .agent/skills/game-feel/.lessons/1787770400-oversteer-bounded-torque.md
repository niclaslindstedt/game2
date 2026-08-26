---
title: Oversteer that needs a counter is a BOUNDED ungated torque — un-gating the saturation spins instantly
date: 2026-08-26
scope: engine/game/
concepts: [drift, oversteer, rwd, counter-steer, pendulum]
---

Two ways to make a drift demand counter-steer, and only one is playable.
Pushing the saturation angle out with throttle un-gates EVERY deepening
force at once (full-lock steer term + slip self-rotation), and the car
swaps ends in ~1.2 s — no reaction window. A separate bounded power torque
(`T.grip.powerYaw · throttle · slide`, ungated by `sat`) instead parks the
slip at a predictable equilibrium `powerYaw / (driftLat · surfaceGrip)`:
deep enough that the drift never ends on its own, gentle enough to catch.
That formula is the tuning handle — surface grip scales it, so low-grip
surfaces spin easier for free. But even the bounded torque must ALSO fade
with steering INTO the slide (`× (1 − intoSlide)`): applied mid-corner it
deepens the held drift past the tuned park angle and the whole game reads
as steering too much — playtesting called it "wobbly". Gated that way the
oversteer lives only at the EXIT: steered in, the corner is classic; wheel
released, the slide lingers and takes a real counter to settle. The
pendulum (a catch that swings into an opposite drift) needs no extra
mechanism: a slightly lowered `yawResponse.slide` leaves momentum in the
body, and the soft sign on the torque (`clamp(-slip/0.08)`) re-aims it at
the new slide the moment slip crosses centre. Verify with slip-vs-time
traces from a scripted probe, not the sim table — the table only shows
drift time rising; the traces show whether the catch exists and whether
the mid-corner park angle moved.
