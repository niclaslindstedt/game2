---
title: The menu's backdrop is a full stage build with no loading card behind it — changing which stage a page wants freezes the menu for seconds
date: 2026-09-09
scope: pwa/src/App.tsx, pwa/src/game/menu-demo.ts
concepts: [menus, load, performance, stage-spec]
---

A race is stood up behind the loading card because compiling a route and
building the country around it is seconds of indivisible main-thread work
(`race-loader.ts`). The MENU has no card, and it stands a stage up the same
way: `showBackdrop` → `backdropFor` → `applyStage`, synchronously, inside the
effect that reacts to the page change. So any menu press that lands on a
different stage pays the whole cost with the cards frozen where they stood —
measured at ~2 s of world rebuild plus ~1 s of lazy shader compile (the menu
never calls `renderer.warm()`).

What decides cheap or ruinous is `ensureTrack`'s KEY, not `sameStage`. Same key
→ the cached track, `previous.track === state.track`, and the renderer answers
with `setCar`/`setConditions` — a body swap, tens of milliseconds. Different key
→ `setGame`, the whole world, and every shader after it. The key is seed,
length, shape, biome, the numeric knobs, season, temperature and the apron's
`cars`; laps, grid, carId, hour, weather and sandstorms are all free.

So a menu backdrop should reuse the road already standing wherever it can
(`menu-demo.ts`'s `demoStage` takes exactly the keyed fields off it), and any
new backdrop rule needs a fixed point: the backdrop is re-asked for on every
settings change behind the cards, and by then what is standing IS the last
backdrop. A rule that does not return itself rebuilds the world on every press.

Two roads are never worth adopting: the training arena (a bot loose in it never
finishes, so the demo never rolls off) and an `endless` length, which
`ensureTrack` recompiles however it is asked for.
