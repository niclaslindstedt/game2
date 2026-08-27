---
title: A steering probe on a synthetic straight leaves the road in about a second and starts measuring `nature` — widen the track AND stop at `state.offRoad`
date: 2026-08-27
scope: tests/, engine/game/car.ts
concepts: [test-conventions, synthetic-tracks, probes, surfaces, drift]
---

A car held at lock on a `compileTrack` straight is driving a circle, so it
crosses the verge within a second or two at any real speed. Past that the
physics is on `nature` (grip 0.7, its own drag and top-speed cap) and every
number the probe prints is about the landscape rather than the car.

It reads as plausible nonsense, which is the dangerous part: a first pass at a
response-curve probe reported the front-driver reaching 63° of slip on the
throttle versus 25° off it — an inverted, enormous power-oversteer effect that
does not exist. Off-road grip loss, not the drivetrain. The same contamination
made the lock sweep non-monotonic (0.5 lock deeper than 0.75), which looks
exactly like the two-state failure `drift-feel` warns about.

Two things fix it, and both are needed: build the track wide
(`{ ...base, width: 220 }`, or `compileTrack(seed, segments, { width: 1 })`),
and **stop the trace the moment `state.offRoad` goes true**, reporting that it
did. A run that ends early is a reading you can still use; a run that silently
continues is not.

When the probe needs a steady state rather than a transient, pin the ground
speed after each step (`hypot(u, w)` rescaled to the target) — that isolates
the yaw response from whatever the throttle is doing to pace, and leaves the
slip angle untouched.
