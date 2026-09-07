---
title: A load step that can count itself makes its WHOLE phase's bar measured — give it its own label or the bar freezes on the indivisible steps beside it
date: 2026-09-07
scope: pwa/src/game/race-loader.ts, pwa/src/game/loading-screen.tsx, pwa/src/App.tsx
concepts: [load, progress, ui, menus, benchmark]
---

`loadPhase` decides a phase's bar one way for the whole phase: if ANY step
sharing that label offers `progress()`, the phase reports `done` and the card
draws a MEASURED bar — every step weighted equally, a finished one counting
whole, and a step with no `progress` contributing nothing while it runs.

So dropping a countable step into an existing label is not free. The load's
`Warming up` phase is `ghost`, `tape` and `warm`; `warm` alone is over a second
of indivisible shader compilation with nothing to count. Add a fourth,
countable step to that label and the bar jumps to 0.5 and sits there for the
whole of `warm` before walking — where today, with nothing countable in the
phase, it runs smoothly against `expectedMs` from `load-times.ts`. A frozen bar
is the exact reading the card exists to avoid giving.

A step that counts itself therefore wants its own label, which also gets it its
own slot in the card's `(n/of)` count. That is what the benchmark's warm-up
does: the countdown it draws under the card is `Warming the tyres`, a phase of
its own with a bar walking frames-drawn over the countdown's length, while
`Warming up` beside it keeps its estimate.

Steps a caller adds to the tail of a load go through `beginLoad`'s `extra`
argument (`startStage` passes it on); they are appended after `warm`, so what
they draw is the finished scene.
