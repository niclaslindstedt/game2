---
title: `make profile` cannot see a RESOLUTION change at all, and may never finish in a web session
date: 2026-09-06
scope: scripts/profile-render.mjs, pwa/src/game/settings.ts
concepts: [profiling, rendering, harness, resolution, review]
---

`AGENTS.md` requires `make profile` before and after "any rendering change",
which reads as covering a change to `RESOLUTION_SCALE` or `setPixelRatio`.
It does not, for two independent reasons — and neither is visible from the
table, which comes back looking like a clean no-op.

**The metrics are pixel-ratio invariant.** Draw calls, triangles and binds
count what is SUBMITTED, and the pixel ratio only changes how many fragments
each submission covers. A change that doubles every frame's fragment cost
moves not one number in the table.

**The harness runs at `devicePixelRatio` 1.** So every stop of a row defined
as a share of device native collapses: under the current scale HIGH is
`1 x 1 = 1`, which is arithmetically the same canvas the old `min(1, 2)`
ceiling produced. Before and after are literally the same configuration, and
the identical table is proof of nothing.

The real cost of a resolution change lives on a retina phone — three device
pixels per CSS pixel is nine times the fragment work of one — and nothing in
this repo's headless tooling can reach it. Say so in the PR and ask for a
look on real hardware; do not quote an unmoved profile table as evidence.

**It also may not finish here.** Two runs of `make profile` in one web
session container (software rasterization, no GPU) were still going at 7 and
20 minutes with nothing past `profiling seed 42 at 1280x720`. Start it in the
background if you start it at all, never let two run at once — they contend
for the same cores and starve each other, and a concurrent profiler is enough
to flake a timing-sensitive vitest file that passes seven times in a row
alone — and be ready to judge the change STRUCTURALLY instead (does it add a
pass, a material, a mesh?) rather than blocking a deliverable on a
measurement that cannot move.
