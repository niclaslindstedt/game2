# Getting started

## Playing

Open [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/). The game boots to the pre-race screen over a live view of today's stage: pick the **stage length** (short ≈1 minute, medium ≈3, long ≈5, extra long ≈7 — or **endless**, which streams new road from the seed for as long as you drive), the **time of day** (dawn, day, dusk, night — the stage re-lights as you tap), the **weather** (clear, rain, storm — weather sets the wind, and the wind leans on the car), and the **car**, then START — a 3-2-1 countdown and you're driving.

### Controls

**Desktop (keyboard):**

| Key       | Action                          |
| --------- | ------------------------------- |
| ↑ / W     | Throttle                        |
| ↓ / S     | Brake                           |
| ← → / A D | Steer                           |
| Space     | Handbrake — unsticks the rear   |
| L. Shift  | Booster — finite, no refills    |
| E / X     | Shift up (manual car)           |
| Q / Z     | Shift down (manual car)         |
| C         | Race setup (time, weather, car) |
| V         | Camera: chase ↔ hood            |
| B         | Back to the track (off-road)    |
| R         | Restart stage                   |

**Phone (touch):** the left half of the screen is the wheel — touch anywhere and drag sideways to steer; the wheel turns as far as you push it. The right half is the pedal: touching it is GAS, drag up to BRAKE, drag down to burn the BOOSTER (finite — it never refills), drag right for the handbrake (DRIFT — unsticks the rear for tight curves). The manual car adds − / + gear buttons. Works in portrait and landscape — the HUD re-flows.

### Installing on your phone

The game is a PWA. iOS Safari: Share → **Add to Home Screen**. Android Chrome: menu → **Install app** (or accept the install prompt). The installed game launches fullscreen, works offline once loaded, and shows an in-app prompt when a new build ships.

### How a run works

Stages are point-to-point: start gate to finish gate. The cluster in the bottom-left is the instrument panel: rev counter, gear (with a shift light), and speed. The stage number in the HUD is the seed — everyone gets the same stage on a given day, and every finish rolls into the next seed after a few seconds.

**Off the road is a real place.** The landscape around every stage is driveable — forests, hills, mountains, streams, lakes and open sea — and the car rides it fast (up to ~150 km/h in the wild; ~230 km/h flat out on the road). Cliff edges and banks throw the car if you hit them with pace; boulders and fallen trunks are genuinely solid, and deep water swallows the car whole. A crash puts you back on the track where you left it. There is no off-road timer: explore as long as you like, and press **B** (or the HUD's TRACK button) when you want back.

**Drifting** is not a button — it is just what the car does when you turn harder than the tires can hold, which past about 70 km/h is any committed turn. Steer into the bend and the car goes sideways while the road keeps flowing: steering into it deepens it, lifting the throttle tightens it, counter-steering gathers it up. It costs you almost no speed, so there is nothing to count and nothing to cash in — just keep it flowing. The handbrake is there to unstick the rear in something really tight. **Jumps** throw you off ramps; midair the car barely answers, so line up before the lip and land straight or lose speed. **Fords** splash and drag; **crests** can go light at full speed.

## Developing

```sh
git clone https://github.com/niclaslindstedt/game2
cd game2
npm install        # needs a GitHub Packages token — see docs/configuration.md
npm run dev
```

Then read [architecture.md](architecture.md) for the layout and [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow. The three tools you'll live in while tuning: `make sim` (does the change help or hurt, measured), `make track` (what the generator builds), `make screenshots` (what it looks like).
