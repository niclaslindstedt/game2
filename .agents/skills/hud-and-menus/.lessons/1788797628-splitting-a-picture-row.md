---
title: Splitting a lever off the DETAIL row touches four files, because no renderer ever reads DETAIL_PRESETS
date: 2026-09-07
scope: pwa/src/game/settings.ts, pwa/src/game/menu-options.tsx
concepts: [settings, menus, video, rendering, migration]
---

`DETAIL` is not a stored field — it is a row DERIVED over a slice of
`VideoSettings` (`DetailSettings`, `DETAIL_PRESETS`, `detailOf`). Every
renderer consumer reads its own lever off `video.<lever>` and never the preset,
so giving a lever a row of its own is contained to `settings.ts`,
`menu-options.tsx` and `tests/settings_test.ts` — nothing under the renderer
moves. Grep `DETAIL_PRESETS` to confirm before planning anything larger.

The four edits in `settings.ts`, all required:

1. Drop the key from `DetailSettings` **and** from all three `DETAIL_PRESETS`
   entries — `tsc` catches a leftover (TS2353), `vitest` does not, so typecheck
   before trusting a green suite.
2. State the lever explicitly in `DEFAULT_VIDEO`; it no longer arrives via
   `...DETAIL_PRESETS.medium`.
3. Add a `*_STOPS` ladder and a `PICTURE_ROWS` key, then a row in
   `pictureRows()` — the benchmark card and the options page read the same
   list, and `.bench-video` wraps, so a new cell needs no CSS.
4. In `loadSettings`, read the lever off the raw blob AFTER the preset assign,
   the way `sky` already is. A blob written while the lever was on DETAIL
   carries the player's own choice; read off the preset instead, everyone who
   had ever moved DETAIL comes back to a setting they never picked.

Then re-count the two row-count comments in `menu-options.tsx` (the column
packing note and the PICTURE group's "N rows, not one") — both are prose that
nothing checks, and both were already one stale when this pass found them.
