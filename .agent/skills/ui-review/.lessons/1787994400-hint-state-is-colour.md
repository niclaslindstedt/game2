---
title: Per-word state inside a HUD hint has to be COLOUR — the parent's opacity multiplies down, and the pulled-toward rule repaints the whole hint
date: 2026-08-29
scope: pwa/src/styles.css, pwa/src/game/hud-touch.tsx
concepts: [css, hud, touch, cascade]
---

The pedal hint (`.hud-hint`) carries a resting `opacity: 0.4` on the whole
label, and `.hud-pedal-hint[data-dir="…"]` repaints it to `opacity: 1` plus
`color: var(--hud-good)` while the thumb pulls that way. Both bite anything
that tries to give ONE WORD inside a hint a state of its own:

- **Opacity multiplies.** A child at `opacity: 0.55` under a parent at `0.4`
  renders at `0.22` — fainter than the word beside it, which is the opposite of
  what a "this one is available" state wants to say. Any per-word emphasis has
  to be colour; the parent already owns the opacity.
- **The pulled-toward rule paints the parent, and children inherit.** A word
  that means "the engine will refuse this" goes gold the moment the thumb
  points at it unless it states `color` outright. State BOTH halves of a
  two-state word explicitly (`.hud-hint-gear` and `.hud-hint-gear.armed`) — an
  inherited default is not a state.

Concretely: the manual box's `GEAR +` / `GEAR −` words say whether the revs
will take the flick, and gold-vs-ink is the only thing that can carry it.
