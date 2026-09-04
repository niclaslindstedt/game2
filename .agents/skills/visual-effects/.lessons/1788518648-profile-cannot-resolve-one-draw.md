---
title: "`make profile`'s draws is not a build constant — the same build read 346, 353, 353, so it cannot gate a change worth one draw call"
date: 2026-09-04
scope: scripts/profile-render.mjs
concepts: [performance, measurement, rendering, harness, profiling, verification]
---

`scripts/profile-render.mjs` meters over a WALL-CLOCK window, so how far the
car gets down the stage before the window closes depends on how fast the
machine is that minute — and that decides how many chunks, trees and props
are in frame. `draws` therefore moves with container load, not just with the
build.

Measured: three readings of one identical `driving` build came back **346,
353 and 353**, and `tris` swung 12k with `geometry` swinging 1.2 MB alongside
them. A gated-vs-un-gated A/B (parking a `THREE.Points` pool, worth exactly
one draw call) read 353/353 against 347/350 — the _wrong way round_, and
entirely inside that spread.

So: a rendering change worth under ~10 draws on `driving` **cannot be
verified with this harness on a loaded machine**. Judge it structurally
instead — a new pass? a new material? a new object in the scene? or only an
instance count? — which is what AGENTS.md already says to do, and which is
sound without the table. Reserve the table for changes big enough to clear
the noise (the field's cars are +301 draws; that one is real).

Two traps this cost a session:

- **Comparing across invocations.** A baseline taken in a three-scene run and
  a check taken in a one-scene run are not comparable at all. If you must
  measure, A/B the two builds back to back in ONE script, twice each.
- **Predicting an exact figure in the PR body.** "Should drop from 346 to
  345" is unfalsifiable here, and it merged before the numbers arrived. State
  the structural claim, and only promise a table you know the instrument can
  resolve.

Also: `make profile` takes its scene filter as POSITIONAL args
(`node scripts/profile-render.mjs driving`). The Make target passes none, so
`make profile SCENES=…` silently meters everything.
