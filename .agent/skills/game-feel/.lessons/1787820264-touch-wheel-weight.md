---
title: A touch steering axis mapped straight from finger position gives the player no way to ask for a LITTLE — shape the throw and give the rim weight
date: 2026-08-27
scope: pwa/src/game/hud.tsx
concepts: [steering, touch, hud, drift]
---

A position-mapped thumb axis (`steer = dx / REACH_PX`) turns every wobble
into a steering input: at a 70 px throw, 15 px of thumb noise is already a
fifth of full lock, which past ~70 km/h is a drift the player did not ask
for. Two independent levers fix it and both are needed:

- **Shape the throw** — `sign(t) * |t| ** 1.6`. Full travel still means full
  lock, but the first centimetre buys much less, so a slight steer is a
  target a thumb can hit.
- **Give the rim weight** — do not assign the thumb's value; chase it at
  `FLOOR + GAIN * |gap|` lock/s (1.4 + 8 works: a held 20 px drag arrives in
  ~70 ms, a full shove in ~250 ms, an opposite-lock countersteer in ~240 ms).
  Rate proportional to the GAP is what keeps a hard input sharp while a
  wobble that is corrected before the rim catches up never steers at all;
  a rate keyed to the wheel's own angle instead would blunt countersteer,
  which is the one input a drift cannot afford to lose.

The chase needs its own `requestAnimationFrame` loop started on pointerdown
and cancelled on release (plus an unmount cleanup): a thumb that holds still
fires no `pointermove`, so event-driven integration stalls mid-turn.

Measure it, do not feel it: drive the built app with `page.mouse` gestures
(wobble-out-and-back, hold-small, full shove, countersteer) and sample
`getComputedStyle(el).getPropertyValue("--turn")` after each — the numbers
above came from that probe and took one run.
