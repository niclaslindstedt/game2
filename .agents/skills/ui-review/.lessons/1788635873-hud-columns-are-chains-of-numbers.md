---
title: A HUD column is a CHAIN of custom properties on `.hud`, never a set of percentages — and its fit is measured off the PAINTED extent, not the layout box
date: 2026-09-04
scope: pwa/src/styles.css, pwa/src/game/
concepts: [hud, css, responsive, minimap, instruments, measurement, hud-stacking]
---

Both HUD columns are one chain of numbers, and an instrument added to either
owes the whole chain. The RIGHT-HAND one hangs off `--hud-map`, declared as
"the minimap's edge length" and in fact the column's WIDTH: the map, the stage
chip's clearance, the condition schematic (`calc(var(--hud-map) * 0.78)`) and
the top bar's right stop all derive from it — `grep -n "var(--hud-map)"`
before resizing anything, because those offsets read as unrelated rules. The
TOP-OF-FRAME one is `--glass-bottom` → `--split-top` → `--pace-top` →
`--flash-top`: the mirror, the split's flash, the calls, the run's news.

The tach inverts it: `.hud-tach`'s width/height are the ONLY size it has,
since `hud-dial.tsx` draws into `viewBox="0 0 100 100"` and every tick and
counter drum is a fixed fraction of that box.

**A percentage `top` cannot stack these.** Every one of them is sized in
`vmin` with `rem` caps, so the room it takes is a different FRACTION of the
height on a 1080p monitor, a laptop and a phone held sideways — `.hud-flashes`
at a fixed 32% cleared the calls on one viewport and was written straight
across them on the other three. Reserve each band off what it HOLDS
(`--split-band` is its own two font sizes; `--pace-band` is the sign's clamp),
and reserve it whether or not anything is in it — a band that appears pushes
the corner call down the screen exactly while it is being read.

**And a state that moves the column is a data attribute on the root, not a
modifier class per instrument.** `data-glass` on `.hud` redefines
`--split-top` once and everything below follows; a class each would need a
`@media` copy each, which is the cascade trap two lessons over.

**Measuring it:** `transform: scale()` on a child does NOT shrink the parent's
layout box, so `.hud-pace`'s `getBoundingClientRect()` overhangs its paint by
the second call's 42% and a fit probe reports a false overlap. Read the LAST
`.hud-pace-call`'s own rect — an element's rect does include its own
transform.
