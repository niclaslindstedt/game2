---
title: A HUD tier computed from the car's own state argues with itself — size a warning off the ROAD, at a fixed reference
date: 2026-09-04
scope: pwa/src/game/hud.tsx, pwa/src/game/snapshot.ts, engine/game/
concepts: [hud, calls, instruments, pacenotes]
---

When an instrument grades a hazard — how big this jump is, how hard this
corner is — the obvious implementation reads the car: how far WOULD I fly at
the speed I am doing. It is wrong, and the failure is a loop rather than an
inaccuracy. Lift for the BIG JUMP and it becomes a plain JUMP, so the reason
for the lift disappears at the moment the lift works, and the call flickers
between two words for the whole braking zone.

Corner severity already gets this right by accident of where it comes from:
it is a property of the road, and the driver answers to it. Grade every other
hazard the same way — off the geometry, at one documented reference speed
(`jumpSize` in `engine/game/jump.ts` uses 37 m/s, the median pace the
generator's own speed profile says a car meets a lip at).

Pick the tier lines by MEASURING the population rather than choosing them:
the jump bands are the quartiles of the flight over 193 lips across seeds,
lengths and both ends of the challenge dial, which is what makes the rare word
actually rare. A threshold picked by eye puts every feature in one bucket —
the first guess here called 100% of the game's jumps "big".
