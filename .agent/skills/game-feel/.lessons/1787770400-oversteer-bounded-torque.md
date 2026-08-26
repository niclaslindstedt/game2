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
surfaces spin easier for free. The pendulum (a catch that swings into an
opposite drift) needs no extra mechanism: lower `yawResponse.slide` leaves
momentum in the body, and the soft sign on the torque (`clamp(-slip/0.08)`)
re-aims it at the new slide the moment slip crosses centre. Verify with
slip-vs-time traces from a scripted probe, not the sim table — the table
only shows drift time rising; the traces show whether the catch exists.
