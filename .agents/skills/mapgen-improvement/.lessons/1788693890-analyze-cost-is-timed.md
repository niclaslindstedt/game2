---
title: An `analyze` diff that moves only the last column and the perf.build findings is a TIMING regression, not a geometry one
date: 2026-09-06
scope: engine/mapgen/, engine/analysis/
concepts: [analysis, performance, search, measurement, water]
---

`make analyze`'s rightmost scored column is COST, and cost is wall-clock:
it reads the `perf.build` finding, which times plan / compile / terrain
against a 260 ms budget. So a change that cannot possibly have moved a
stage can still shift the mean, add `perf.build` lines, bump every
"… and N more" truncation by one, and flip a seed from pass to fail —
and the diff reads exactly like a generator regression.

How to tell them apart in one look: if every column EXCEPT the last is
identical and every new line is a `perf.build`, the geometry is untouched
and what you have is a performance regression. `make sim` is the
cross-check — it drives the compiled tracks, so a byte-identical sim table
proves the roads did not move.

What caused it here: R48 gave `LandField` a set of ice-aware readers, and
the plain ones grew a predicate callback (`nearestAt`/`shoreLevelAt` with
an `accept`) plus one extra `water.levelAt` per height-walk step through
`buildableAt`. `keepsDry` is asked of every probe point of every candidate
segment, so a fifth of the plan phase went on answering "is this frozen?"
with "no" a million times on a summer stage.

The fix is the shape to reach for whenever a feature adds a reader to the
search's hot path: decide ONCE, when the field is built, whether the
feature can fire at all (`icyCountry` off the country's ceiling), and hand
out the plain readers when it cannot — predicate and all, not a predicate
that returns true quickly. That put the mean and the total build time back
on top of `origin/main`.
