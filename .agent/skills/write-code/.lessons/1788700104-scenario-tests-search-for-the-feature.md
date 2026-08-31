---
title: A scenario test must SEARCH for the feature it needs, never name the seed that had it
date: 2026-08-31
scope: tests/
concepts: [test-conventions, seeds, determinism, mapgen]
---

Anything named `compileStage(5, "medium")` because seed 5 had a concrete deck
is a test that breaks on the next generator change, and breaks in the most
expensive way: it fails somewhere unrelated to the change, with an assertion
about physics or terrain, and reads as a regression. Any change to the rules
re-rolls the search, so seed 5 after is a different stage from seed 5 before.

Two habits that make these survive:

- **Find the feature, then assert on it.** Walk a list of candidate seeds and
  take the first whose stage actually has the thing (`for (const candidate of
[…]) { … if (deck > 0) { seed = candidate; break; } }`), with an
  `expect(found, "no seed put a concrete deck on a medium stage")` so the
  failure names the real problem when none does.
- **Assert against geometry the code owns, not a round number.** A parapet
  scenario asserting `width / 2 + PARAPET_GAP + 0.05` fails the day it lands on
  a different bridge; the same one asserting `+ PARAPET_THICK / 2` says what it
  means — the bodywork is inside the concrete with half its thickness to go —
  and holds whatever the routing does. The 0.05 was measured on one approach
  and the next approach spent 0.066.

The same applies to any threshold a re-rolled search moves. When one does have
to move, put the before/after MEASUREMENT in the comment, not just the new
number.
