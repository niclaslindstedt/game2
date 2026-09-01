---
title: The renderer keeps its OWN handle on the standing stage — a path that only relights, never rebuilds, leaves it stale and something later puts the old state back
date: 2026-08-28
scope: pwa/src/game/renderer.ts
concepts: [renderer, conditions, roam, time-of-day, weather, state-handle]
---

`renderer.ts` holds `game: GameState | null` as its handle on the stage that
is standing, and two callers relight off it rather than off an argument: a
camera entering or leaving the map (`setCamera`), and a video option
(`setVideo`). It was only ever rebound where the WORLD is built — `setGame`
and `setCar` — while `setConditions`, the one entry point whose whole job is
a new state on the same road, left it alone.

That is invisible on any path that rebuilds the world, which is why the
campaign and `?tod=` looked fine and a bug report that reads "time of day
does nothing" is still true. Roam is the path that does not: the map preview
and the run share one compiled track, so picking a time of day only ever
reaches `setConditions`, and the map-to-chase switch on DRIVE IT then
relights from the handle — the state Roam OPENED in. Every choice was
applied and then thrown away one call later.

Two things to carry: when a module keeps a reference to a caller's state,
EVERY entry point that receives a newer one has to rebind it, not just the
expensive ones; and when a feature works from a URL param but not from the
menu, suspect the cheap path — the menu is what reuses things.
