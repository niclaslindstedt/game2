---
title: Anything that draws less when the frame rate drops has to be PINNED for both meters, or they measure themselves
date: 2026-08-31
scope: scripts/profile-render.mjs, pwa/src/game/benchmark.ts
concepts: [profiling, benchmark, adaptive, determinism, mirror]
---

The moment a renderer learns to spend less when frames get slow, both of this
repo's meters are measuring the wrong thing, and each in its own way:

- **`make profile`** rasterizes in software at a handful of frames a second.
  A governor does exactly what it was built for and falls to its floor, so the
  table comes back describing the governor — and describing it as an
  IMPROVEMENT, because the numbers genuinely went down. Two builds are then
  not comparable at all.
- **The benchmark** feeds every frame a fixed sixtieth of a second whatever it
  cost to draw. A governor reading that sees a machine holding sixty and will
  climb back up mid-run — the workload changing under the stopwatch, which is
  the one thing a fixed workload may not do. A session that had already
  dropped a rung before the card was opened starts the same race drawing less
  than a fresh one.

So the knob gets a pin, and both harnesses set it: `?mirrorhz=` for the
profiler (read in `App.tsx`, held in `mirror-pace.ts`), `pinMirrorPace` around
the run for the benchmark. Pin at the TOP rung — the cost the numbers are
being read for is the cost on a machine that is coping.

When you add the next adaptive knob, this is the checklist: does the profiler
pin it, does the benchmark pin it, and does the benchmark hand it back when
somebody walks away from the card.
