---
title: `make profile`'s draws/tris are NOT reproducible run to run on a slow machine — the metering window is wall-clock, not frames
date: 2026-08-30
scope: scripts/profile-render.mjs
concepts: [profiling, rendering, harness, benchmark, review]
---

`AGENTS.md` and this skill both say draw calls, triangles and binds "are the
same numbers on every machine, so it is the one that is trustworthy in
headless Chromium and the one a PR quotes". That is only true where the
machine draws fast enough.

Each scene settles at a fixed STAGE TIME and is then metered over a fixed
six-second WALL-CLOCK window (`WINDOW` in `scripts/profile-render.mjs`), with
the per-frame figures divided by however many frames landed in it. Under
software rasterization that is 5–15 frames, and the car travels a different
distance through the window on each run — so a different set of road chunks,
props and trees is in frustum, and the averages move.

Measured here on two runs of one seed, one of them a scene the change under
test could not touch at all:

```
scene      draws before → after
menu           258 → 289   (+12%)   ← nothing in the diff touches the menu
driving        438 → 453   (+3%)
frames metered  15 →   8   (menu)
```

So a ±10% movement in this table proves nothing on a container. Judge a
rendering change STRUCTURALLY first — does it add a pass, a material, a
mesh, or only change an instance COUNT? — and quote the table only when the
movement is far outside that spread, or when the frames-metered counts
match. An instanced batch drawn with fewer instances cannot move `draws` at
all, whatever the table says.

Fixing it properly means metering a fixed number of frames at a fixed stage
position rather than a wall-clock window.
