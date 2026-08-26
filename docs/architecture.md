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

- `src/game/renderer.ts` — the three.js facade: builds a `World` per stage (road ribbon with start/finish dirt aprons, rumble strips, dirt skirts, fords, rally gates with hay bales), the car, dust particles, and the camera. It reads `GameState`; it never steps physics. Everything is fullbright and vertex-colored with procedural speckle textures (`textures.ts`) — the rough arcade look is deliberate.
- `src/game/biome.ts` / `flora.ts` — the nature: biomes as data (ground palette + weighted plant communities, so trees cluster into spruce woods, birch groves, pine heaths and open meadows), and the parametric low-poly flora library (~26 tree/shrub/ground-cover variants, one instanced mesh per variant, wind-swayed grass and ferns). Placement in `world.ts` is seeded by the track seed; the `nature` skill owns the details.
- `src/game/car-body.ts` / `car-styles.ts` / `car-mesh.ts` — the car: a parametric builder that lofts a low-poly body (hood, greenhouse, fender flares, bumpers, lights, wheels, spoilers) from a JSON-friendly `CarBodySpec`, with a fixed fake sun baked into vertex colors; the per-car specs (keyed by catalog id); and the scene wrapper that pitches the body to the road and the flight, spins and steers the wheels, and adds the jump-selling blob shadow. Iterate on looks with `make cars` (see the `car-design` skill).
- `src/game/camera.ts` — camera **modes** (`chase`, `hood`), built to grow more. The chase cam tracks a blend of nose and travel direction so drift angle reads on screen.
- `src/game/input.ts` / `hud.tsx` — keyboard + touch, and the arcade HUD (also the touch control surface).
- `src/App.tsx` — the fixed-timestep loop (engine at 120 Hz regardless of frame rate), the daily-seed stage rotation, car swap, and the framework's PWA update toast.
- `pwa-plugin.ts` — hand-rolled service worker + manifest emission per deploy slot (the same pattern as the sibling contacts app); `src/app-pwa.ts` holds the cache-id contract both sides share.
- `src/identity.ts` — the single source for name, copy, palette, and URLs.
- `src/output-bridge.ts` — routes the engine's output module into the oss-framework log store.

The [oss-framework](https://github.com/niclaslindstedt/oss-framework) supplies the update-prompt state machine and UI (`pwa`), logging (`logging`), and the theme tokens its components style with; the runtime is Preact via `preact/compat` overrides.

## `tests/` and `scripts/`

Root-level vitest suites cover the generator's R-rules, the drift and jump moment by moment, the gearboxes, and full bot simulations (see [simulation.md](simulation.md)). `scripts/` holds Node tooling: the sim CLI, track previews, headless screenshots, the icon/OG generator (pure-Node PNG encoder in `scripts/lib/png.mjs` — no native image deps), the SEO checker, and the release plumbing (`scripts/release/`, changeset fragments → CHANGELOG).

## Deployment

The app deploys to GitHub Pages at [game2.niclaslindstedt.se](https://game2.niclaslindstedt.se/) in three slots — `/` (latest release tag), `/preview/` (main), `/branch/` (parked feature branch) — via `pages.yml`; `release.yml` cuts versions from changeset fragments and chains the deploy. Details in [configuration.md](configuration.md); platform shells beyond the web in [platforms.md](platforms.md).
