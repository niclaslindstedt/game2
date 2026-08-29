---
title: The app has TWO render loops now — per-frame work added to App.tsx's rAF frame is invisible to the benchmark
date: 2026-08-29
scope: pwa/src/App.tsx, pwa/src/game/benchmark.ts
concepts: [rendering, profiling, harness, benchmark]
---

`App.tsx`'s `requestAnimationFrame` loop is no longer the only thing that
steps the engine and calls `renderer.render`. `pwa/src/game/benchmark.ts`
pumps its own frames through a `MessageChannel` (vsync would cap the very
thing it measures), and the rAF loop RETURNS EARLY for as long as one is up
— two loops drawing the same state would each be timing the other.

So the two loops have to be kept saying the same thing by hand. Anything
added to the rAF frame that costs real per-frame work — a renderer pass, a
field call, an effects update — is simply not in the benchmark's frame
unless it is added there too, and the benchmark then reports a number for a
frame the game does not draw. The reverse is the same bug from the other
side.

The benchmark deliberately does NOT carry the app's per-frame bookkeeping
(the HUD snapshot, the audio bed, the tape, the ghost, the debug trace):
those are the app playing a run, not the machine drawing one. The line is
whether it puts pixels on the canvas. When in doubt, read the two loops side
by side — the benchmark's `tick` is thirty lines and the whole comparison
fits on a screen.
