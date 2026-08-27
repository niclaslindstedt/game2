---
title: A HUD-driven wait must be an INEQUALITY — the snapshot repaints every 80 ms, so an exact string is a race
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/App.tsx
concepts: [harness, scenes, tooling, hud]
---

Waiting on the HUD is the right way to reach a moment, but `textContent ===
'0'` is not a wait, it is a bet. `App.tsx` refreshes the HUD snapshot only when
`hudClock > 0.08`, so any value the car passes THROUGH between two repaints is
never painted, and the wait spins to its timeout.

`shot-tarmac-launch` lost this bet for months: it braked and waited for a
literal `'0'`, but the brake does not park the car — once stopped, the same
pedal backs it out (`CarState.reversing`), so the readout leaves zero and
climbs again. It passed roughly one attempt in four and hung 120 s the rest,
taking the whole sweep down with it.

Two rules follow. Write every HUD wait as `<=` / `>=` over `Number(...)`, never
`===` over a string. And when the value is a MAGNITUDE that turns around
(speed under braking), add the state that says it turned — `.hud-gear` reading
`R` — as an `||` branch, so the condition stays true once reached instead of
being true for one frame.
