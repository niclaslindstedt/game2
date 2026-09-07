---
title: A new sky state that no `make sky` row pins is a state nobody reviews — add the row with the change
date: 2026-09-07
scope: pwa/src/tools/sky-preview.ts
concepts: [sky, screenshots, review, seeds]
---

`make sky` shoots a fixed set of ROWS (`ROWS` in `pwa/src/tools/sky-preview.ts`)
against nine hours. Each row pins its own seed through `gust`, so a state the
chart only rolls sometimes simply will not appear on the sheet — the review
loop the `atmosphere` skill calls required then passes a change it never
photographed.

Adding a state to the chart means adding a row pinned to a seed that rolls it.
Find the seed with a few lines of Node against the module directly
(`node --experimental-strip-types -e 'import("…/cloud-field.ts")'`) rather than
by re-shooting the sheet: the sheet is a minute, the search is a second. Shoot
the same seed on both `sky: "full"` and `sky: "simple"` when the state is one
the two skies have to agree about.
