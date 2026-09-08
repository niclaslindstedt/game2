---
title: The three car-demand rows are sums over different axes and must be divided by their own medians before they are compared
date: 2026-09-08
scope: engine/rating/
concepts: [demand, calibration, campaign, cars]
---

`RATING.demand`'s three rows weight the character axes into one share per car.
Measured raw they are not comparable: each is a sum over a different set of
axes with a different natural size, so the row with the biggest weights on the
axes this generator happens to max always wins.

Concretely, `slide` leans on `tight`, and every stage this generator builds is
fairly tight — so the median stage came out 0.53 slide against 0.27 grip and
0.21 power, and `make rate CAMPAIGN=1` reported that NOTHING in the entire
committed campaign was a stage for either of the other two cars. That reads as
a damning finding about the roster and it was arithmetic.

`RATING.demand.scale` divides each row by its own median contribution across
the sweep, which puts a road with no opinion at a third each. **Re-measure the
three whenever the generator moves enough to shift the character axes** — run
the population sweep, read the `demand.*` percentile rows, and set each scale
to that row's median. A campaign audit that suddenly says one car is never
wanted is this drifting, not the roster changing.
