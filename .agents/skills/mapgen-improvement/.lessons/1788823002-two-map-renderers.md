---
title: A new stage feature is drawn on TWO maps — `stage-render.mjs` is `make track`, `level-map-render.mjs` is `make level` — and a feature id needs a key row and a mark case as well
date: 2026-09-02
scope: scripts/lib/stage-render.mjs, scripts/lib/level-map-render.mjs, scripts/lib/stage-features.mjs
concepts: [preview, tooling, level-map]
---

The first `make level` after adding a feature showed its `PV1` label and
none of its geometry: the drawing had gone into `stage-render.mjs`, which
is `make track`'s picture, and the level map has a renderer of its own.
Four places, all of them, for a feature to exist on the maps:

1. `stage-features.mjs` — the id, its `rank()` entry, and the
   `stageSummary` count (plus the summary line in `level-map.mjs`).
2. `stage-render.mjs` — the geometry on the track preview.
3. `level-map-render.mjs` — the geometry AGAIN on the level map, a `MARK`
   colour, a `case` in the mark switch for the id's own sign, and a `row`
   in the key.
4. The feature list in `docs/track-generator.md`.

Check by rendering `make level SEED=<a seed the probe says has one>` and
LOOKING for the geometry, not the label.
