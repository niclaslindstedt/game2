# Getting started

## Playing

Open [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/). The app opens on an attract screen: the studio card while the game loads, then the title under two crossed finish flags and **press any key to start** (tap, on a phone). It waits for you — the press is also what lets the browser turn the sound on. Behind it the game is already running, and clearing the card drops you on the **main menu**, which is not a still: a bot is driving a real stage behind it, seen from a drone, and it keeps going while you decide. Four ways in:

- **Campaign** — a location (Taiga, for now) and its six stages, each one unlocked by finishing the one before it. Locked stages wear a grey border and a padlock; open ones wear green. The ladder climbs in both length and difficulty, from a 1-minute forest road to seven minutes of hairpins and jumps in a night storm — and then changes discipline: the last two are **circuits**, three laps of a closed lap that comes back to its own start line, where you get to learn the road and the clock is the whole opponent.
- **Time trial** — the same stages, gated by the same unlocks, with your best time on each: a time is something you chase on a road you have already driven. Your best run comes back out as a **ghost** — a see-through copy of the car you set it in, driving the stage again exactly as you drove it, while a chip beside the clock counts the metres of road between you. It cannot be touched: the ghost runs its own game, so there is nothing there to hit.
- **Roam** — any seed at all. The stage pane shows the map that seed builds as an island of land around the route, turning slowly, with its lakes, hills and forest standing and the **route drawn on it in yellow** (green marks the start, red the finish), so you choose by looking rather than by reading a number. The map is yours to handle: **drag** it to turn it and to tilt it down toward the horizon — which is how you see what "alpine" actually did to it — **scroll or pinch** to zoom in, and **double-click** to put it back. It picks its slow turn back up a few seconds after you let go. Previous/next walk the seed; the slider walks the length band (short ≈1 minute, medium ≈3, long ≈5, extra long ≈7 — or **endless**, which streams new road from the seed for as long as you drive), and the STAGE panel beside it — shape, hills, water, forest, tarmac, road width — says what KIND of country the seed builds, with the map redrawing as you press one. **Shape** picks between a SPRINT, which runs from a start line to a finish somewhere else, and a CIRCUIT, which closes back onto its own start line and is raced over three laps — same minutes of driving either way, cut into laps instead of laid out in a line.
- **Options** — the HUD, the renderer, and the controls. See below.

The **car** is picked on any of those pages, turning on its stand. **Time of day** (dawn, day, dusk, night) and **weather** (clear, rain, storm — weather sets the wind, and the wind leans on the car) are yours on Roam and authored into each campaign stage. Pick a stage and you drop into a 3-2-1 countdown.

### Controls

**Desktop (keyboard).** Every one of these is rebindable in Options → Controls — click a binding, press the key you want.

| Key       | Action                        |
| --------- | ----------------------------- |
| ↑ / W     | Throttle                      |
| ↓ / S     | Brake — and reverse, stopped  |
| ← → / A D | Steer                         |
| Space     | Handbrake — unsticks the rear |
| L. Shift  | Booster — finite, no refills  |
| E / X     | Shift up (manual car)         |
| Q / Z     | Shift down (manual car)       |
| Esc       | In-race menu (pause)          |
| C         | Back to the main menu         |
| V         | Camera: next of six angles    |
| B         | Back to the track (off-road)  |
| R         | Restart stage                 |

**Phone (touch):** one half of the screen is the wheel — touch anywhere and drag sideways to steer. The rim has weight — it turns toward your thumb rather than snapping to it, so a thumb wobble is not a slide and a slight steer is a real option, while a committed shove takes it to full lock in about a quarter second. A blue arc fills the rim from 12 o'clock to the marker, showing how much lock the car has. The other half is the pedal: touching it is GAS, drag down to BRAKE, drag up to burn the BOOSTER (finite — it never refills), drag right for the handbrake (DRIFT — unsticks the rear for tight curves). Pulling the thumb back is the car being reined in, pushing it away is the car being sent — the gesture means what it looks like. Keep the brake held once the car has stopped and it backs up, so a nose in a tree is something you drive out of. Which half steers, and which drag does what, are set in Options → Controls; each direction holds one action, so assigning a taken one swaps them. The manual car adds − / + gear buttons. Tap the **minimap** for the in-race menu (resume, restart, main menu). Works in portrait and landscape — the HUD re-flows, and in portrait the booster stands up beside the dials.

### Options

**HUD** switches off anything you do not need on screen — minimap, pacenotes (and separately their WORDS, leaving just the corner arrows to read at a glance), damage glyph, tachometer, boost tank, wind, stage clock. Speed, gear and the countdown stay: those are the game.

**Video** is the set of levers that buy frames on a weak device: **resolution** (the pixel-ratio ceiling, and the biggest single win), **draw distance** (how far the fog lets you see), **effects** (dust, spray, exhaust, rain and the ambient life), and **undergrowth** — the grass, shrubs and stumps scattered between the trees, which applies to the next stage you start because it is baked into the geometry. Undergrowth is a picture setting and nothing more: the trees you can HIT are always drawn whatever it says, so turning it down never makes a stage easier. How thickly the forest itself stands is a stage dial, set per run in Roam.

**Controls** only ever offers what the device you are on can use: a desktop gets the key bindings, a touch device gets the thumb layout, and a laptop with a touchscreen gets both.

### Installing on your phone

The game is a PWA. iOS Safari: Share → **Add to Home Screen**. Android Chrome: menu → **Install app** (or accept the install prompt). The installed game launches fullscreen, works offline once loaded, and shows an in-app prompt when a new build ships.

### How a run works

Stages are point-to-point: start gate to finish gate. The cluster in the bottom-left is the instrument panel: the car's condition on top (the damage glyph, plus whatever the moment has to say), then rev counter, gear with a shift light, speed, and the booster.

The **clock** owns the top-left corner, because in a racing game the clock is the opponent: TOTAL TIME big, and under it — on a circuit — the LAP TIME with the lap counter beside it, then the laps already set this run and the record the stage is holding for you. The **minimap** sits top-right: the whole stage drawn as a route, the car riding it as an arrowhead, and the run's progress read off the frame — the border fills clockwise from the top as you get further in (on a circuit it fills once per lap and reads LAP 2/3; an endless run has no finish to fill toward, so it reads the distance covered instead). Tap or click it for the in-race menu — resume, restart, or back to the main menu. The stage number under the map is the seed. Finishing takes you back to the menu with your time on screen; a campaign stage records the clear, which is what opens the next one.

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
