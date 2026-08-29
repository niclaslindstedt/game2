---
title: A HUD state read CONTINUOUSLY must sit outside `.hud-hint` — its resting opacity multiplies into every child, and the pulled-toward rule repaints them all
date: 2026-08-29
scope: pwa/src/styles.css, pwa/src/game/hud-touch.tsx
concepts: [css, hud, touch, cascade]
---

The pedal hint (`.hud-hint`) carries `opacity: 0.4` on the whole label, and
`.hud-pedal-hint[data-dir="…"]` repaints it to `opacity: 1` plus
`color: var(--hud-good)` while the thumb pulls that way. Both bite anything put
INSIDE a hint that needs a state of its own:

- **Opacity multiplies.** A child at `0.55` under a parent at `0.4` renders at
  `0.22` — fainter than the word beside it, which is the opposite of what an
  "available" state wants to say. A child can never be brighter than its hint.
- **The pulled-toward rule paints the parent, and children inherit.** A word
  meaning "the engine will refuse this" goes gold the moment the thumb points
  at it unless it states `color` outright.

So a two-state indicator that is read every few seconds — the manual box's gear
flicks are the case — belongs BESIDE the hints, as its own absolutely
positioned element under `.hud-pedal-hint`, carrying its own opacity and its
own drop-shadow. Inside a hint it can only ever be as loud as a label that was
designed to be ignorable.

The layout slot is worth stealing too: `.hud-flick` takes the position left of
the thumb, and `[data-flick]` pushes a left-bound pedal's label out to
`6.6rem`. Ordering by how OFTEN a thing is read beats ordering by what was
there first.
