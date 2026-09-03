---
title: After a scripted edit to a dense defs file, read that file's `git diff` before moving on
date: 2026-09-03
scope: engine/mapgen/rules.ts, engine/game/defs/
concepts: [tooling, defs, review]
---

`engine/mapgen/rules.ts` is three thousand lines of nested rule groups, and the
same key name recurs in a dozen of them. A `sed -i 's/      step: .*/…/'` aimed
at `town.lot.step` also rewrote the start-placement walk's `step: 120` to `0.40`
— which does not fail a typecheck, does not fail a test quickly, and quietly
invalidated a measurement sweep that was running at the time.

Any scripted edit to a defs file gets `git diff <file>` read immediately after,
not at commit time. Better still, anchor the match on a neighbouring line rather
than on the key alone (a Python replace of an exact multi-line block, or `Edit`
with enough context to be unique).
