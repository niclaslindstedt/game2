---
title: "`make analyze` sweeps ONE shape, and the default is sprint — a circuit-only defect can sit in the tree for as long as nobody types --shape circuit"
date: 2026-09-11
scope: engine/mapgen, engine/analysis, scripts/analyze-stage.mjs
concepts: [analysis, circuit, sweeps, coverage]
---

A third of the campaign is lap stages, and every `make analyze` run that
does not say `--shape circuit` says nothing about any of them. A defect
that only a circuit can have — anything hanging off R22's "the last sample
IS the first", which is the two ends being each other's road — therefore
survives a clean sweep indefinitely.

Read a rules or terrain change on BOTH shapes, and read the sprint sweep as
the control: a change that is meant to reach one shape and comes back
byte-identical on the other (same mean, same severe count, same failing
seeds) is a far stronger claim than any amount of reasoning about which
branch it took.

The same asymmetry is in the labs. `make verge` drove a sprint and nothing
else until it was given `SHAPE=`; check what shape a lab actually builds
before quoting it as evidence about a lap stage.
