---
title: The analyzer's finding TALLY counts how often a check's worst got worse, not how bad a stage is — compare check VALUES from the JSON report
date: 2026-09-06
scope: engine/analysis/, scripts/analyze-stage.mjs
concepts: [analysis, measurement, tally, review]
---

Every lane-walking check pushes a finding each time it meets a stride
worse than the worst so far, so the count under `rollers.grade N on M
seeds` is the length of a rising sequence — a stage whose first bad stride
is its worst reports one finding, a stage that worsens stride by stride
reports a dozen for the same worst value. After the crest rounding the
taiga tally went 103 → 149 while the check's mean value fell 0.45 → 0.39
and `rollers.edge` halved; read as a count it was a regression.

Compare `--json` reports instead: per check, the mean and the worst of
`value` over the seeds and how many seeds stand over `budget`
(`scratchpad/compare.mjs`-style — forty lines). The txt tally is still the
right thing for ERRORS, which are one per seed per check.
