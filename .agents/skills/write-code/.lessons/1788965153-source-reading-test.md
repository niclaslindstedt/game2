---
title: A test that reads a SOURCE FILE by path breaks when its subject is split — move the read, do not re-export around it
date: 2026-09-09
scope: tests/, scripts/lib/
concepts: [file-size, module-split, test-conventions, parity]
---

`tests/powerline_test.ts` holds `make level`'s restated `WAYLEAVE`/`ARM`
against the rule book by REGEXING the source of
`scripts/lib/level-map-render.mjs` — the numbers cannot be imported there,
because a plain `.mjs` under `scripts/` carries no types.

Splitting that module moved the two `export const` lines into
`level-map-ink.mjs` and left a re-export behind. Every consumer kept working
and the test failed, because a re-export is not a STATEMENT of a number.
`make lint` and the typechecker both stayed green; only the suite caught it.

So: after splitting any module, grep the suite for its path —
`grep -rn 'new URL("\.\./' tests/` finds every test that reads source rather
than importing it — and point the read at the file that now states the value.
Re-exporting to keep the old path working is the wrong fix: it leaves a test
asserting against a file that no longer holds the fact.
