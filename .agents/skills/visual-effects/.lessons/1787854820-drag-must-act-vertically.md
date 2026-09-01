---
title: A light particle needs drag on the VERTICAL axis too, or a fired burst leaves the frame
date: 2026-08-27
scope: pwa/src/game/dust.ts, pwa/src/game/celebration.ts
concepts: [particles, dust, confetti]
---

`createDust` integrates `velocity` against `style.gravity`. Give a style a
`drag` that only damps x/z and a burst fired upward keeps its whole muzzle
speed against nothing but gravity: the finish cannons' confetti at 17 m/s
with paper's gravity (1.1) climbed about seventy metres and hung there, out
of frame, while the shot it existed for showed an empty sky.

Damp all three axes. Then the pair that decides the look is `drag` and
`gravity` together: rise ≈ `speed·sin(pitch) / drag`, and terminal fall =
`gravity / drag`. Confetti at drag 1.8 / gravity 2.5 arcs ~5 m up and
flutters down at 1.4 m/s, which is paper.

Aim matters as much as the physics. A cannon cocked near-vertical (60°+)
throws its load out of the frame whatever the drag; 35–45° across the road
puts the arc at banner height, which is where the car is.
