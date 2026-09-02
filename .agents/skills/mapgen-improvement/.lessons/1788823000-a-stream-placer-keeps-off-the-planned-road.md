---
title: A placer on an endless stage must keep off the PLANNED road and claim its ground from the stream's future — the compiled samples are not the route
date: 2026-09-02
scope: engine/mapgen/compile.ts, engine/mapgen/endless.ts, engine/mapgen/energy.ts
concepts: [endless, streaming, placement, keep-off, energy]
---

On a stream the route does not stop at the frontier: `endless.ts` runs
`commitLag` (900 m) ahead of the road it hands out, and the compiler places
things against `track.samples` alone. A wind farm reaching 400 m off the
road and 800 m along it, placed at `horizon - STREAMED_HOLD`, had the road
laid a moment later run 0.35 m from a tower — the single-call stream had
refused that spot, the chunked one could not see why.

Two channels fix it, and both are needed:

- **`stream.ahead()`** — the search's live probe points. The placer folds
  their distance into `routeDistance`, so road already decided but not yet
  compiled counts as route.
- **`stream.keepOff(x, z, r)`** — a disc the search's `place()` refuses
  from then on, so road planned LATER goes round what was just placed.
  Radius = the thing's footprint plus `roadClearance(width)`.

They are handed to `createCompiler` as an optional `stream` argument; a
finite stage passes none. Even so a chunked stream and a single call differ
in WHICH slots place (the single call sees more road and refuses more), so
the chunked-vs-single test asserts the RULES on the finished road — never
on the road, never in the water — not the metre, exactly as
`carparks_test.ts` does.
