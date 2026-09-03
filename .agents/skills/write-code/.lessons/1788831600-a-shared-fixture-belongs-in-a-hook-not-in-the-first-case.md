---
title: A file's shared fixture belongs in a `beforeAll`, not in whichever case touches it first
date: 2026-09-03
scope: tests/
concepts: [test-conventions, timeouts, harness, measurement, fixtures]
---

Three red or nearly-red tests in one session, one defect: a file memoizes
something expensive — 24 compiled stages, a report cache, a seed search —
every case reads the memo, and whichever runs FIRST pays to build it. That
cost is measured against one case's allowance instead of against the file, so
a dozen cheap assertions hide a fifteen-second build and the file passes on
how busy the runner was.

The tell is a PASSING test whose duration is most of its allowance
(`carparks_test` at 26.5 s of 30 s failed on the next run; `analysis_test` at
19.2 s of 20 s had not yet). Verbose timings find them:

```sh
npx vitest run --reporter=verbose 2>&1 | grep -oE "tests/.* [0-9]+ms$" \
  | sed -E 's/^(.*) ([0-9]+)ms$/\2 \1/' | sort -rn | head -20
```

Build it in a `beforeAll` sized to the build: identical work, no longer
charged to an assertion. A case whose long run is real work
(`simulation_test` drives twelve bot runs) has nothing to hoist and keeps an
explicit allowance — that is the distinction, not how slow the case is.

And when raising `testTimeout` in `vitest.config.ts`, grep for the per-test
numbers it overtakes: `analysis_test`'s sixteen `20_000` overrides raised the
bar over a 5 s default, then 2f601cf made 30 s the default _citing that file_
and left them capping it.
