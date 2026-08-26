# Getting started

## Playing

Open [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/). The game boots straight into today's stage — a 3-2-1 countdown and you're driving. There is no menu yet, by design: the slice is the driving.

### Controls

**Desktop (keyboard):**

| Key       | Action                        |
| --------- | ----------------------------- |
| ↑ / W     | Throttle                      |
| ↓ / S     | Brake                         |
| ← → / A D | Steer                         |
| Space     | Handbrake — the drift button  |
| L. Shift  | Booster — finite, no refills  |
| E / X     | Shift up (manual car)         |
| Q / Z     | Shift down (manual car)       |
| C         | Swap car (restarts the stage) |
| V         | Camera: chase ↔ hood          |
| R         | Restart stage                 |

**Phone (touch):** the left half of the screen is the wheel — touch anywhere and drag sideways to steer; the wheel turns as far as you push it. The right half is the pedal: touching it is GAS, drag up to BRAKE, drag down to burn the BOOSTER (finite — it never refills), drag right for the handbrake (DRIFT — good for tight curves). The manual car adds − / + gear buttons. Works in portrait and landscape — the HUD re-flows.

### Installing on your phone

The game is a PWA. iOS Safari: Share → **Add to Home Screen**. Android Chrome: menu → **Install app** (or accept the install prompt). The installed game launches fullscreen, works offline once loaded, and shows an in-app prompt when a new build ships.

### How a run works

Stages are point-to-point: start gate to finish gate. The stage number in the HUD is the seed — everyone gets the same stage on a given day, and every finish rolls into the next seed after a few seconds. Go too far off the road and the game lifts you back on after a moment (that's the respawn).

**Drifting** is the game: flick the handbrake (or commit a hard steering flick at speed) to break the rear loose, steer through the slide — steering into it deepens it, lifting the throttle tightens it, counter-steering ends it — and a clean exit pays a speed boost. **Jumps** throw you off ramps; midair the car barely answers, so line up before the lip and land straight or lose speed. **Fords** splash and drag; **crests** can go light at full speed.

## Developing

```sh
git clone https://github.com/niclaslindstedt/game2
cd game2
npm install        # needs a GitHub Packages token — see docs/configuration.md
npm run dev
```

Then read [architecture.md](architecture.md) for the layout and [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow. The three tools you'll live in while tuning: `make sim` (does the change help or hurt, measured), `make track` (what the generator builds), `make screenshots` (what it looks like).
