# Architecture

The repository follows the shape of its sibling game repo: a headless engine that IS the game, a thin browser shell that draws it, and tooling that measures it. One direction of dependency:

```
tests/  scripts/(sim, previews)          pwa/ (Preact + three.js shell)
        \                                 /
         `----------->  engine/  <-------'
                 (framework-free TypeScript)
```

## `engine/` — the game, headless

The engine is a pure TypeScript module with no framework, no renderer, and no DOM. Its public surface is `engine/index.ts`:

- `createGame({ seed, carId })` builds a run: the compiled stage and a car on the grid.
- `step(state, input)` advances one fixed 120 Hz timestep and returns the `GameEvent[]` that step emitted (`takeoff`, `landing`, `splash`, `shift`, `respawn`, `finish`, …). The browser's render loop and the headless simulator call this same function — there is no other way to advance a run.

Determinism is a hard invariant: everything random draws from the seeded RNG in the state (`engine/lib/prng.ts`), never `Math.random`, so a seed fully reproduces a stage and a bot run — which is what the sim digests and shareable daily stages rely on.

Internally:

| Module          | Owns                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game/car.ts`   | The handling model: grounded + airborne steps, the grip-and-slide model, gearboxes                                                                                                           |
| `game/defs/`    | Content as data: the car catalog, the global feel tuning                                                                                                                                     |
| `game/step.ts`  | Run orchestration: phases, progress, respawns, finish, event emission                                                                                                                        |
| `game/track.ts` | Car-to-track queries: progress fix, lateral offset, surfaces, lips                                                                                                                           |
| `mapgen/`       | The stage rules engine — see [track-generator.md](track-generator.md) — and the terrain field (`terrain.ts`): the seeded driveable landscape around the road, shared by physics and renderer |
| `sim/`          | The bot driver and headless simulator — see [simulation.md](simulation.md)                                                                                                                   |
| `output.ts`     | The §19.4 central output module (semantic `status/info/warn/error/header/debug` with a pluggable sink)                                                                                       |
| `version.ts`    | The engine version constant (rewritten by `scripts/update-versions.sh`)                                                                                                                      |

## `pwa/` — the browser shell

A Vite + Preact app that renders the engine and ships it as an installable PWA:

- `src/game/renderer.ts` — the three.js facade: builds a `World` per stage (road ribbon with start/finish dirt aprons, rumble strips, dirt skirts, fords, rally gates with hay bales), the car, dust particles, and the camera. It reads `GameState`; it never steps physics. The world is lit by the environment's own hemisphere and sun (`environment.ts`) and vertex-colored with procedural speckle textures (`textures.ts`); the CAR is fullbright, its shading baked into vertex colors so the arcade look never pops, and the environment hands the renderer a tint that puts the failing light back on the paint. The rough arcade look is deliberate.
- `src/game/biome.ts` / `flora.ts` — the nature: biomes as data (ground palette + weighted plant communities, so trees cluster into spruce woods, birch groves, pine heaths and open meadows), and the parametric low-poly flora library (~26 tree/shrub/ground-cover variants, one instanced mesh per variant, wind-swayed grass and ferns). Solid-tree placement lives in the ENGINE's terrain field (`terrain.treesNear` + the grove quilt — the trunks are collided with); `world.ts` dresses each engine trunk with a species and scatters the soft drive-over flora itself, all seeded by the track seed. The `nature` skill owns the details.
- `src/game/car-body.ts` + `src/game/car/` — the car generator. `car-body.ts` is the assembly line; the parts live beside it: `car/spec.ts` (the whole `CarBodySpec` vocabulary, pure types), `car/builder.ts` (the triangle accumulator that bakes a fixed fake sun into vertex colors, plus the patch helpers), `car/shell.ts` (the lofted chassis — wheel-arch openings cut into the flank, panel shut lines as V-grooves, and the geometry queries every other part asks of it), `car/greenhouse.ts` (windows cut out of a solid cabin, gutters, wipers), `car/fascia.ts` (grille, lamps, wrap-around bumpers, air dam, detachable bonnet and boot lid), `car/trim.ts` (arch extensions, mirrors, handles, mud flaps, livery bands, blocky door numbers, spoilers) and `car/wheels.ts` (three rim styles on a faceted tire). `car-styles.ts` holds the per-car specs as pure data — no three.js — so Node tooling and the `--variants` loop can read them.
- `src/game/car-mesh.ts` — the scene wrapper: pitches the body to the road and the flight, spins and steers the wheels, and adds the jump-selling blob shadow. `car-damage.ts` bends the body's polygons from the engine's damage ledger and tumbles torn-off parts as debris; `car-dirt.ts` spatters a stage's worth of grime onto them, heaviest at the wheels that threw it. Iterate on looks with `make cars` (see the `car-design` skill).
- `src/game/ghost.ts` — the time trial's ghost, kept as the CONTROLS the run was driven on rather than as a path. The engine is deterministic, so replaying a recorded input tape through a second `GameState` on the same compiled track reproduces the run exactly — every drift, jump and dent — for a few tens of kilobytes a stage (run-length coded, one localStorage key per level). The bargain that buys it is that `input.ts` snaps the wheel and the pedals onto that tape's grid before the engine sees them, so what is written down is what was driven. Nothing connects the two games, which is why the two cars cannot touch.
- `src/game/camera.ts` — camera **modes**. Six can be driven from and are one ladder from inside the car outwards (`hood`, `close`, `chase`, `far`, `heli`, `top`); `drone` and `map` are placed by the app for the menu backdrop and the Roam page. The five outside ones are the same rig with different proportions — one table of numbers, one update function — so an angle is a row rather than another camera. They track a blend of nose and travel direction so drift angle reads on screen, and the distant ones carry weight: their lateral swing is a sprung mass that overshoots a turn and settles back. `hood` is the exception: it sits on the car's own scuttle (the mount is read off that car's silhouette in `car-styles.ts`, so the bonnet fills the bottom of the frame) and the eye is a driver's HEAD — a damped spring chasing the mount, thrown forward under the brakes and sideways through a corner, plunging and rebounding through a landing, with the road's grain shaken through it and a glance into the slide.
- `src/game/input.ts` / `hud.tsx` — keyboard + touch, and the arcade HUD (also the touch control surface). `minimap.tsx` builds the top-right map from the compiled track and draws it: the route, the car's arrowhead, and the run's progress as a gauge on the frame's own border; tapping it opens the in-race menu (`menu.tsx`, which also holds the pre-race card).
- `src/lib/synth.ts` / `src/lib/tracker.ts` / `src/game/audio/` — the sound. A small WebAudio synth (the only module in the tree that touches an `AudioContext`), a tracker sequencer, the sound bank as data, the event router, and the continuous road bed the engine/tyres/wind/drift are made of. Nothing is a file: every effect and every note is synthesized from parameters — see [audio.md](audio.md), and hear it with `make audition`.
- `src/App.tsx` — the fixed-timestep loop (engine at 120 Hz regardless of frame rate), the daily-seed stage rotation, car swap, and the new-build card (`game/update-card.tsx`, fed by the framework's `usePwaUpdate`).
- `pwa-plugin.ts` — hand-rolled service worker + manifest emission per deploy slot (the same pattern as the sibling contacts app); `src/app-pwa.ts` holds the cache-id contract both sides share.
- `src/identity.ts` — the single source for name, copy, palette, and URLs.
- `src/output-bridge.ts` — routes the engine's output module into the oss-framework log store.

The [oss-framework](https://github.com/niclaslindstedt/oss-framework) supplies the update-prompt state machine and UI (`pwa`), logging (`logging`), and the theme tokens its components style with; the runtime is Preact via `preact/compat` overrides.

## `tests/` and `scripts/`

Root-level vitest suites cover the generator's R-rules, the drift and jump moment by moment, the gearboxes, and full bot simulations (see [simulation.md](simulation.md)). `scripts/` holds Node tooling: the sim CLI, track previews, the audio audition page, headless screenshots, the icon/OG generator (pure-Node PNG encoder in `scripts/lib/png.mjs` — no native image deps), the SEO checker, and the release plumbing (`scripts/release/`, changeset fragments → CHANGELOG).

## Deployment

The app deploys to GitHub Pages at [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/) in three slots — `/` (latest release tag), `/preview/` (main), `/branch/` (parked feature branch) — via `pages.yml`; `release.yml` cuts versions from changeset fragments and chains the deploy. Details in [configuration.md](configuration.md); platform shells beyond the web in [platforms.md](platforms.md).
