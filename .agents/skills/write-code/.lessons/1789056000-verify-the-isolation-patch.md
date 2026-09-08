---
title: An A/B isolation is only worth what its patch is worth — a `const x =` regex hits every `const x` in the file, and a polluted run sends you after the wrong cause
date: 2026-09-08
scope: any bisect-by-patching loop
concepts: [debugging, measurement, sed, isolation]
---

Bisecting a behaviour change by scripting a constant over a range is the
right instrument. What made it lie was the anchor: `s/const cap = .*/.../`
over `limits.ts` also rewrote `askedSlide`'s `const cap = slideCap(spec)`,
so every reading in the scan was of a car with a broken drift model. The
scan came back FLAT — which read as "the cap does not matter", when what it
meant was "you are not measuring the cap".

Two habits, both cheap:

- **Anchor on something that is unique, and assert it.** `assert
s.count(old) == 1` before writing. Restore from a pristine copy each
  iteration rather than editing the edited file.
- **Before believing a null result, `git diff` the tree.** A scan whose
  answer is "nothing moves" is exactly the case where the patch is most
  likely to be wrong, and the diff takes two seconds.

The same anchor mistake had already cost a session earlier the same day
(`crest:` matching three unrelated rules). It is not a one-off.
