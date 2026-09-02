---
title: A placer's probe queries are BOUNDED or they are the whole compile — an unbounded `highways.nearest` cost the R24 test eleven seconds
date: 2026-09-02
scope: engine/mapgen/compile.ts, engine/mapgen/highway.ts
concepts: [performance, spatial-hash, placement, towns, homesteads, tests]
---

`highways.nearest(x, z)` with no `within` has no first hit to bound its ring
walk, so out in the country — where nearly every probe is — it sweeps all
sixty-four rings to answer "nothing near". `highway.ts` says so in its own
comment; the placers still called it that way, and a town's two walks of a
street ask it a couple of thousand times a stage. `tests/mapgen_test.ts`'s
R24 case (32 stages, four lengths) went from 54 s to 65 s on this machine,
past its 60 s timeout, while CI's faster runners hid it.

A placer only ever compares the answer against a clearance, so pass a
`within` a little over the widest clearance it holds (`HIGHWAY_LOOK` in
`compile.ts`, under the index's `NEAR` so a far probe is one set lookup) and
read null as Infinity. The result is identical wherever the true distance is
past the bound, which is everywhere the comparison cares about — the towns
and homesteads suites prove nothing moved.

The general rule: any query a placer makes per probe — road distance, branch
distance, highway distance, the shelf band — must be bounded by what the
placer is going to compare it with, and a local test's own time against its
timeout is the instrument that catches it: time the slow test alone on the
branch and on `origin/main` in a worktree before blaming the machine.
