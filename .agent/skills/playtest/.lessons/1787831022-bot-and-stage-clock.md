---
title: A scene reaches a PLACE on the stage with ?bot=1 and HUD-driven waits — never with a wall-clock timer and blind keys
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/App.tsx
concepts: [harness, scenes, tooling, bot]
---

Two independent things break the "hold ArrowUp for N ms" scene, and both
bite silently — the PNG renders fine, it is just of the wrong moment.

**Wall time is not stage time.** Under software rendering the loop cannot
keep up, so `waitForTimeout(5000)` bought ~1.9 s of stage clock on this
machine and a different number on the next one. Read the run's own
instruments instead: `.hud-timer` for where the drive has got to,
`.hud-speed-num` for stopped/at-pace, `.hud-pace-call` + `.hud-pace-dist`
for "a hard corner at the turn-in" (the distance span disappears under
45 m) and for which way the road goes. `screenshot.mjs` has
`atStageTime`/`stageTime`/`atOpenRoad` for exactly this.

**Blind keys never leave the opening.** Held throttle with no steering is
off the road at the first corner, so anything the generator places further
in is unreachable — and a surface change is gated on a JUNCTION (R15/R17),
so `?asphalt=1` still opens on ~130 m of gravel behind a real corner. Hence
`?bot=1`: the bot drives until a control is touched, then hands over for
good (`autopilotRequested`/`driving` in App.tsx). Ride out on it, take the
wheel where the scene wants to act.

Taking the wheel is still the risky part. A stage road is ~8 m wide: a
handbrake flick at 120 km/h is in the trees inside a second, and a car in
the trees photographs the WRONG surface's effects. Brake back to ~55 km/h
first, flick toward the corner the co-driver just called rather than a
guessed direction, and shoot ~0.45 s in.
