---
title: The HUD is the harness's only cursor into a run, so what it shows and when is a CONTRACT — and every wait on it must be an inequality
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/game/hud.tsx, pwa/src/game/snapshot.ts, pwa/src/App.tsx
concepts: [harness, scenes, tooling, hud, screenshots, playwright]
---

Under software rendering the sim advances at a fraction of wall time, so a
`waitForTimeout` lands somewhere different on every machine. Every scene
therefore navigates by reading the HUD — and nothing type-checks that coupling.
Four rules, each of which has already cost a whole sweep:

**Write every wait as an INEQUALITY over a number**, never `===` over a string.
`App.tsx` refreshes the snapshot only when `hudClock > 0.08`, so a value the car
passes THROUGH between repaints is never painted and the wait spins to its
timeout. (The clock and the start lights read a per-frame `LiveRun` instead —
see `hud-clock.tsx` — and an inequality is still right there, because the frame
rate decides which hundredths get painted.) When the value is a magnitude that
turns around — speed under braking, which reverses once stopped — add the state
that says it turned (`.hud-gear` reading `R`) as an `||` branch.

**Prefer a cursor that asks whether an instrument has anything to say** over one
that reads what it says: `!document.querySelector('.hud-pace-call')` is open
road, the same selector turning truthy is the turn-in, `.hud-start-shot` is the
establishing shot and `.hud-lights` is the countdown. Those survive a
display-rule change; `.hud-pace-dist >= 150` did not, and hung 180 s.

**The clock's `textContent` is parsed as `M'SS"CC` by one shared `READ_CLOCK`.**
Anything else put INSIDE `.hud-clock-total` breaks the regex and hangs every
driving scene; new chips go beside it in `.hud-topleft`. `READ_CLOCK` answers
null when the element is absent, because the HUD is not in the DOM while the
world builds.

**A wait only converges while the car is still being driven at the thing.**
Order the scene so the cursor is reached on the way in — wait for the call,
then brake toward the corner it named.

So: after any change to what the HUD shows or when, grep `screenshot.mjs` for
the element's class, and re-run the whole sweep rather than the scene you
edited — the failure is a timeout in a scene you were not thinking about.
