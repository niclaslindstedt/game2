---
title: A tuning sweep by `sed` over a bare key name clobbers every rule that shares it — the rule book has four `crest:` and they mean four different things
date: 2026-09-08
scope: engine/mapgen/rules.ts, engine/game/defs/tuning.ts
concepts: [tuning, rules, measurement, harness]
---

Sweeping one number across a few values to measure it — `sed -i "s/    crest:
[0-9.]*,/    crest: $c,/" engine/mapgen/rules.ts` — looks safe and is not.
`STAGE_RULES` is a deep tree of small groups, and the same short key appears in
several of them: `crest` is the dune profile's exponent, the fill's rounding
run (`verge.crest`, 42), the road-follow curvature cap (0.004) and a `crest: {`
block. `sed` replaces EVERY matching line, so one sweep set three unrelated
rules to the value under test.

It fails loudly but late: `rules_test` catches `verge.crest` against the
lattice, and `alpine_test`'s pinned TAIGA digest catches the road-follow one —
by which point the session has already run several measurement sweeps and is
attributing the movement to the thing it was tuning. The 12-seed analyze sweep
that looked like a regression was two clobbered constants.

Two habits that avoid it. Sweep a value by editing the ONE line by index
(read the file, assert the line's current text, write it back) rather than by
pattern. And before believing any before/after, `git diff <file> | grep '^[-+]'`
— a one-number sweep whose diff has three number lines in it has not measured
what it thinks.
