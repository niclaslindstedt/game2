---
title: Never run `make test` beside ANY heavy job — a sim, an analyze, or a headless-Chromium probe — its timeouts read as ten regressions
date: 2026-09-02
scope: tests/
concepts: [harness, test-conventions, timeouts, screenshots, playwright, probe]
---

The generator suites (`analysis_test`, `carparks_test`, `homesteads_test`,
`roads_test`, `water_test`…) each build a couple of dozen stages inside a
per-test timeout, and anything else working the same machine is enough to push
them past it: `make analyze COUNT=24`, `make sim`, and equally a
`make screenshots` pass or a throwaway Playwright probe, which are the ones
that do not feel like load because they are not the test harness. The failure
list is then a set of unrelated tests — determinism, water, barriers, car
parks, circuits, towns, farms — every one a bare `Test timed out in 30000ms`
with no `expected` line, which looks exactly like a state leak from whatever
was just edited.

Read the failures before chasing them: a batch of long-running tests failing
together with no assertion message is load, and the tell is that the file
durations are several times their usual. Confirm it by running one of them
alone on an idle machine (`ps -eo cmd | grep chromium` first — a browser from
a killed probe outlives the script that started it).

So: run the sweeps, the probes and the screenshot passes to completion FIRST —
they are the baseline anyway — then `make test`, alone, as the gate.

A UI or CSS task is the one that gets caught, because its verification IS a
browser: a rotation probe left running against the gate turned a green suite
into ten red files. If a single test still times out on an idle machine while
CI's shards pass it, look at what it does before touching it — a case that
runs twelve 15-car field simulations (`tape_test`'s difficulty ladder) needs
its whole budget and has no fixture to hoist, and raising the timeout for one
slow container is not a fix.
