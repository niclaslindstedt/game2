---
title: Never run the sweep suites while `make sim` or `make analyze` runs in the background — their timeouts read as eight regressions
date: 2026-09-02
scope: tests/
concepts: [harness, test-conventions, timeouts, measurement]
---

The generator suites (`analysis_test`, `carparks_test`, `homesteads_test`,
`roads_test`, `water_test`…) each build a couple of dozen stages inside a
per-test timeout, and a background `make analyze COUNT=24` or `make sim` on the
same machine is enough to push them past it. The failure list is then a set of
unrelated "sweep" tests — determinism, water, barriers, car parks — with no
assertion message, which looks exactly like a state leak from whatever was
just edited.

Read the failures before chasing them: a batch of long-running tests failing
together with no `expected` line is load. Run the before/after sweeps to
completion first (they are the baseline anyway), then the tests, and keep
`make test` for the gate when nothing else is running.
