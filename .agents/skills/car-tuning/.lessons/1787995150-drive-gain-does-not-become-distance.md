---
title: A fractional gain on engineAccel does NOT become the same fraction of distance — the taper eats a third of it over 200 m
date: 2026-08-29
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [acceleration, drivetrain, gearing, compensation]
---

Constant-acceleration algebra says two cars at `a` and `a(1+k)` off the same
standstill are apart by `½akt²`, so by the time the leader has covered `s` the
trailing one has gained exactly `k·s` — independent of `a`, the car and the
surface. It is a clean result and it is wrong here, because `a` is not
constant: `engineAccel` tapers to nothing at each gear's top, so most of a
long window is spent where a percent more drive buys well under a percent
more road.

Measured (two identical cars flat out on a compiled straight, one with a
`drive` multiplier, gap read where the leader reaches the window's end), as a
fraction of the ideal `k·s`:

| window | compact | classic | coupe |
| ------ | ------- | ------- | ----- |
| 80 m   | 0.75    | 0.67    | 0.90  |
| 200 m  | 0.65    | 0.52    | 0.80  |
| 300 m  | 0.51    | 0.49    | 0.76  |

The yield is FLAT in `k` (the model is linear in it) and falls with the
window; the spread across the roster is the gearing, and the coupe converts
best because it is still pulling where the classic has run out of gear.

So: any open-loop compensation sized off the algebra under-delivers by about
a third, and shortening the window is the cheapest way to raise the yield.
Size it as `deficit / (window × yield)`, keep the yield as a named tuning
number next to the thing that uses it, and put the measurement in a test
(`tests/mass_start_test.ts`) — otherwise a later change to the torque curve or
the ratios moves it and nothing says so.
