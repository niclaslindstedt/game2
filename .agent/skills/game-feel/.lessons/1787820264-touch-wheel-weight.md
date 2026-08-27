---
title: A touch steering axis mapped straight from finger position gives the player no way to ask for a LITTLE — shape the throw and give the rim weight
date: 2026-08-27
scope: pwa/src/game/hud.tsx, engine/game/defs/tuning.ts
concepts: [steering, touch, hud, drift]
---

A position-mapped thumb axis (`steer = dx / REACH_PX`) turns every wobble
into a steering input: at a 70 px throw, 15 px of thumb noise is a fifth of
full lock, which past ~70 km/h is a drift nobody asked for. Two levers fix
it and both are needed:

- **Shape the throw** — `sign(t) * |t| ** 1.6`. Full travel still means full
  lock, but the first centimetre buys much less, so a slight steer is a
  target a thumb can hit.
- **Give the rim weight** — do not assign the thumb's value; chase it at
  `FLOOR + GAIN * |gap|` lock/s (1.8 + 12: a full shove arrives in ~170 ms).
  Rate proportional to the GAP is what keeps a hard input sharp while a
  wobble that is corrected before the rim catches up never steers at all;
  a rate keyed to the wheel's own angle instead would blunt countersteer,
  which is the one input a drift cannot afford to lose.

**The rim is only the first of TWO lags, and they stack.** The engine's rack
(`TUNING.steering.rackRate`) eases `car.steer` toward whatever the rim hands
it, so a thumb feels the sum — tune either alone and it under-delivers.
Measure them together: drive the rim's chase in sim time inside a node
probe, feed its output to `step()`, and time `|car.yawRate|` to half and 90%
of settled. At 1.4 + 8 behind `rackRate: 9` a full shove took 292 ms to half
the yaw; at 1.8 + 12 behind 13 it takes 225 ms, with the settled cornering
rate identical — only the lag moves.

The chase needs its own `requestAnimationFrame` loop started on pointerdown
and cancelled on release (plus unmount cleanup): a thumb holding still fires
no `pointermove`, so event-driven integration stalls mid-turn.

Measure it, do not feel it: drive the built app with `page.mouse` gestures
(wobble-out-and-back, hold-small, full shove, countersteer) and sample
`getComputedStyle(el).getPropertyValue("--turn")` after each — the numbers
above came from that probe and took one run.
