---
title: Binding R23 in height makes far cells worth walking — carry each bucket's height band, or the point field's ring walk is the stage's whole cost
date: 2026-09-02
scope: engine/mapgen/search.ts
concepts: [search, performance, self-distance, spatial-hash, elevation]
---

R23's map-only clearance let `blocked` stop at ring one of the point
field. Once the clearance grows with the height difference between two
arms (`armSeparation(shelfEnd, rise)` — a hillside between them needs a
bench and a climb, not just the shelf), a far cell CAN hold a point close
enough in height to bind, and walking every ring out to the largest
possible separation made a long stage take six times as long (7.8 s
against 1.3). The fix that kept the rule and the speed: each bucket
carries `minY`/`maxY` of its points, the walk's reach is bounded by the
field's own height band (the separation the largest rise in the field
could demand), and a cell past ring one is only entered when the rise it
could hold makes `armSeparation` exceed its distance. Measure with the
seed sweep before AND after (`make analyze` prints perf.build; the R24 and
R15 suites in `tests/mapgen_test.ts` sit near their timeouts and are the
canary).
