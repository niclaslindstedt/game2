---
title: Only WINTER moves a road, and only in a country with lakes — spring and autumn are dressing
date: 2026-09-08
scope: engine/rating/, engine/analysis/, engine/mapgen/
concepts: [seasons, seeds, campaign, calibration]
---

R48 says the climate can move a line, so the natural fear when a level's season
changes is that every rating and every preview has to be re-swept per season.
Measured instead of assumed (`compileStage` digests over six seeds a country,
all four seasons against summer): spring, summer and autumn build the IDENTICAL
road everywhere, and winter differs in the taiga and the alps and NOT in the
desert — which has no lakes to freeze.

So a candidate sweep needs exactly two passes, summer and winter, and the
desert's winter pool is its summer pool. `rateSeed` and `analyzeSeed` both take
a `climate` now (`make rate SEASON=winter`, `make analyze SEASON=winter`); the
campaign audit reads each level's own season and needs no flag. Before that
they built the summer road unconditionally, so a winter level was rated and
analyzed as a stage nobody drives.
