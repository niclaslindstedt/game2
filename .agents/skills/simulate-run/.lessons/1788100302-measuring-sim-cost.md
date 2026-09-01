---
title: Measure sim cost as min-of-N CPU time and read deltas off the PROFILE — wall clock on a web box is +/-15% noise
date: 2026-08-28
scope: scripts/, engine/
concepts: [performance, simulation, harness, tooling]
---

Timing `npm run sim` to judge an optimization does not work: on a shared box
consecutive identical runs vary by 15%, which is bigger than most single
changes. Three things fix it.

Take the MIN of many repeats of `process.cpuUsage().user`, not the mean or
the median — every sample is the true cost plus interference, so the smallest
is the closest to the truth. Warm up first (a few runs before the timed ones)
or the first sample is JIT.

Read small deltas off `--cpu-prof` instead, comparing each function's share
AND the total sample count between two builds. Sample attribution is far more
stable than wall clock, and it is the only thing that shows a change landing
somewhere other than where you aimed it: a wrapper function that stops being
inlined, or a `SURFACES.map(...)` hoisted "out" of a loop into a per-call
allocation that cost more than it saved.

And measure the HARNESS before believing it. A first microbench of `locate`
read 796 ns/call and moved the wrong way; most of that was the harness's own
`for (const [x, z, i] of pts)` — array-of-arrays destructuring. Rewritten
over parallel `Float64Array`s with an indexed loop, the same function read
238 ns and the deltas became legible.

Split the two halves: `compileStage` in its own timed loop from
`simulateStage`, or a compile-time win reads as noise inside a number that is
four fifths stepping.
