---
title: Scaling a score does nothing to an argmax — a dial that picks a best candidate must bound the SEARCH
date: 2026-09-09
scope: engine/mapgen/geology.ts, engine/mapgen/generate.ts
concepts: [dials, search, siting, calibration]
---

A dial meant to be graduated was wired as a multiplier on the site-scoring
term (`|bias| * height - penalty * spread`). It came out as an ON/OFF
switch: every setting above the threshold picked the same shoulder, because
the best site is the best site whatever its terms are multiplied by. Only
where the competing penalty term is non-zero does the weight change
anything, and on flat country that penalty was zero nearly everywhere.

The fix is to bound what the search LOOKS AT — here the walk's reach
(`siteFar * |bias|`) — which is also what a gentle setting should mean: the
high ground nearby, not the best shoulder in the county. Measured over 10
short taiga seeds the mean net drop then ran 20 m at the middle, 30 at 0.6,
37 at 0.7, 60 at 0.85.

The general rule: if a knob is supposed to be continuous, check it against a
sweep of at least four stops and confirm the MIDDLE ones differ. Two stops
cannot tell a graduated dial from a switch.
