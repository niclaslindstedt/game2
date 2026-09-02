---
title: A throwaway seed sweep run under vitest writes its findings to a FILE — the reporter swallows console.log, and a scratchpad path is outside the suite's root
date: 2026-09-02
scope: tests/
concepts: [seeds, tooling, test-conventions, measurement, harness]
---

The quickest way to sweep seeds with the engine's aliases (`@engine`) is a
throwaway `tests/zz_<thing>_test.ts` run with `npx vitest run <file>` and
deleted after. Two traps: vitest's default reporter drops `console.log`
from a passing test, so the sweep prints nothing — `writeFileSync` the
lines to the scratchpad and `cat` them; and a file OUTSIDE the repo (the
scratchpad) is outside vitest's root and is silently not collected, so
the throwaway has to live under `tests/` for its run. Run the same sweep
in the `origin/main` worktree before re-pinning a fixture: a property the
new seed fails is only worth a re-pin if main's seeds fail it the same way.
