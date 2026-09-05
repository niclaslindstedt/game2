---
title: One HUD instrument's size is one number, and it usually sizes more than that instrument — `--hud-map` is the whole right-hand column
date: 2026-09-04
scope: pwa/src/styles.css, pwa/src/game/
concepts: [hud, css, responsive, minimap, instruments]
---

Asked to resize a HUD instrument, look for what else reads its number before
changing it. `--hud-map` in `.hud` is declared as "the minimap's edge length"
and is in fact the WIDTH OF THE WHOLE RIGHT-HAND COLUMN: the map, the stage
chip's clearance, the condition schematic (`--hud-health-car` is
`calc(var(--hud-map) * 0.78)`), the top bar's right stop, and the portrait
pacenote strip's top offset all derive from it. Growing the map 30% grows the
condition schematic and pushes the pacenotes down — coherent, and worth saying
out loud in the PR, but not what "make the map bigger" literally asked for.

The tach is the same story the other way round. `.hud-tach`'s width/height are
the ONLY size it has: `hud-dial.tsx` draws into a `viewBox="0 0 100 100"`, so
every tick, figure and counter drum on its face is a fixed fraction of that
box. Shrinking the dial shrinks its counters exactly in step, and there is no
way to shrink one without the other short of moving the geometry constants in
`hud-dial.tsx`.

Neither variable has a `@media` override, so one edit is the whole change —
but check with `grep -n "var(--hud-map)" pwa/src/styles.css` first, because
the offsets that clear the column are stated as arithmetic on it and read as
unrelated rules.
