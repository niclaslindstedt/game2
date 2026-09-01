---
title: A particle emitter that resets its clock to zero makes one burst per FRAME — spend the remainder, or the effect's density is the frame rate
date: 2026-08-30
scope: pwa/src/game/fumes.ts, pwa/src/game/dust.ts, pwa/src/game/renderer.ts
concepts: [particles, fumes, dust, performance, harness, frame-rate]
---

The `clock += dt; if (clock > every) { clock = 0; spawn() }` shape looks
right and is not. `EXHAUST.rev.every` is 0.016 s — sixty-odd bursts a second
— which no frame rate answers one burst at a time, so the emitter silently
delivers `min(rate, fps)` and the same car smokes half as much on a 30 fps
phone as on a 60 fps desktop.

Keep the remainder instead: `clock += dt; bursts = min(CAP, floor(clock /
every)); clock -= bursts * every`. The cap is what stops a frame that
arrived late (a stage built, a tab woken) emptying the pool into one
position — 8 covers a full-rate pipe down to ~8 fps. This is the same
bargain `plume.ts` already strikes with its `debts` WeakMap; the trap is
that the fumes and the renderer's own spawn sites did not.

**The corollary bites when you go to LOOK at it.** `make screenshots` runs
software-rasterized, and on a heads-up grid (15 stepped `GameState`s plus
their geometry) the frame is over a second — longer than a puff's ~1.1 s
life, so nothing can accumulate and no cap helps. A still from that rig
cannot judge particle DENSITY at all; it can only judge placement, colour
and which cars are emitting. Verify density by arithmetic (rate x life vs
pool) and by instrumenting the spawn site — a `globalThis` counter read back
with `page.evaluate` proved the field's pipes were firing when the picture
showed nothing — and say in the PR that the shot under-represents it.
