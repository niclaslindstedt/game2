---
title: Key a module-level cache on the OBJECT it describes, never on its seed — and a synthetic rig's road comes from its segment list, not its seed
date: 2026-09-04
scope: pwa/src/game/, tests/
concepts: [caching, test-conventions, seeds, harness]
---

A renderer-side module that caches something derived from a `Track` wants a
cheap cache key, and `track.seed` looks like one. It is not: `compileTrack`
takes a seed AND a segment list, so a synthetic rig and a generated stage
can carry the same seed and be different countries — and a cache keyed that
way hands the second one the first one's roads. Hold the `Track` object
itself and compare by identity (`cache.track !== track`), with
`samples.length` beside it for the endless stage that grows under a track
that never changes.

The same fact breaks the obvious TEST of that cache. "Two seeds, therefore
two different roads" is false for `compileTrack`: the geometry comes from
the segment list, so `compileTrack(11, RIG)` and `compileTrack(12, RIG)`
produce the same centreline and a path-string comparison passes for the
wrong reason. To prove a cache is keyed on identity, build the second track
from a DIFFERENT segment list — and, if the point is that a seed is not
enough, give both the same seed.
