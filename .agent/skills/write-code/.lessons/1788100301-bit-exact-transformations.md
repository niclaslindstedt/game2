---
title: In a determinism-enforced engine only SOME optimizations are bit-safe — know which before you write one
date: 2026-08-28
scope: engine/
concepts: [performance, determinism, physics, simulation]
---

Determinism is enforced by digest, so an optimization is either bit-identical
or it is a behaviour change wearing a performance costume. The line is not
where intuition puts it.

Always safe: hoisting a value out of a loop, reusing the result of a pure
call whose arguments have not changed (check for writes between the two —
`car.heading` is written once, well before both of its readers), replacing a
`Map<string>` cell key with an integer, reading numbers out of typed arrays
instead of objects, and skipping work whose result provably cannot change the
answer.

Never safe, however tempting: `Math.hypot(a, b)` -> `Math.sqrt(a*a + b*b)`
(hypot is the more accurate one); comparing squared distances where the
original compared roots (`a < b` and `a*a < b*b` disagree at the rounding);
and changing the ORDER a search visits candidates in — a row-major cell scan
and a ring-by-ring scan pick different winners on an exact tie, and ties are
not as impossible as they look on an axis-aligned start straight.

When a prune needs an inequality to be sound, give it a margin in the safe
direction (a bounding radius inflated by 1e-9, a threshold multiplied by
1 + 1e-9) so rounding can only ever make it do MORE work, never skip the
answer. Then prove it with a test that brute-forces the same search, and
mutate the margin to check the test actually fails.
