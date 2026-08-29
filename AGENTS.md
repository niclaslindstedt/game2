# Agent guidance for Scandinavian Flick (game2)

This file is the canonical source of truth for AI coding agents working in this repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`, and `.github/copilot-instructions.md` are symlinks to this file.

This repository conforms to [`OSS_SPEC.md`](OSS_SPEC.md) (the committed copy is the version the repo was last validated against; `bash <(curl -fsSL https://raw.githubusercontent.com/niclaslindstedt/oss-spec/main/scripts/validate.sh) .` re-checks and refreshes it). When in doubt about layout, naming, or workflow conventions, the spec is the tie-breaker.

## Build and test commands

```sh
npm install       # needs a GitHub Packages read token — see below
make build        # typecheck + production build (pwa/dist/)
make test         # vitest: generator rules, drift/jump physics, bot sims
make lint         # eslint + typecheck, zero warnings
make fmt          # prettier in place; fmt-check is what CI runs
make sim          # headless balance sweep — REQUIRED before/after any handling or generator change
make track        # render stages to previews/track-<seed>.png
make cars         # render the car models to previews/cars.png (chase-cam + turntable sheet)
make liveries     # render one body in the field's paint schemes to previews/liveries.png
make field        # render the campaign's fourteen rivals in their own cars and colours
make crew         # render the sixteen crew characters (previews/crew.png)
make items        # photograph ONE THING at a time — a turntable per item, on a metre grid
make items-list   # every item the turntable sheet knows, by group
make sky          # render the atmosphere to previews/sky.png (every weather x time, plus a strike)
make audition     # build previews/audition.html — every sound and both scores, playable
make screenshots  # drive the built app headlessly, screenshot key moments
make profile      # meter a frame's draw calls / triangles / binds — REQUIRED before/after any rendering change
make debug-shot   # REPRO='<line off the debug overlay>' — stand where a shot was taken
make icons        # regenerate icons/favicon/og.png from the app mark
make check-seo    # build + structural SEO/PWA/bundle assertions
make hooks        # install pre-commit + commit-msg hooks
```

`@niclaslindstedt/oss-framework` resolves from GitHub Packages, which requires auth even for public reads. Web sessions: `.claude/hooks/session-start.sh` writes the token from the environment (`GITHUB_PAT` et al.) into `~/.npmrc` and installs dependencies automatically. Locally: add `//npm.pkg.github.com/:_authToken=<token>` to your own `~/.npmrc`.

**Verify with `make test` / `make lint` — never a bare `npx vitest run` habit**: the Make targets are the definition of green that CI enforces.

## How work is done here

Two rules that apply to every task in this repo, before any subject skill has a say. Both are the `write-code` skill's, restated here because a session that gets them wrong gets them wrong from its first tool call:

- **Change files with the file tools — Read, then Edit or Write. Never through the shell.** No `sed -i`, no `python3 - <<'PY'`, no `cat > file <<'EOF'`. A shell rewrite hides the actual change behind a script, and this repo's prose comments are full of `$`, backticks, em dashes and backslashes that a heredoc quietly eats. The shell stays the right tool for READING (`grep`, `wc -l`, `git show`) and for running the checks.
- **Lint, typecheck and format ONCE, at the gate — not after every edit.** `make fmt` / `make lint` / `make test` are the commit's gate (the `commit` skill owns the split). Re-running them between one edit and the next re-checks code nobody touched and tells you nothing; batch the whole coherent change, then check it. Mid-loop, if a specific answer is genuinely needed, check only the files you touched (`npx eslint <paths>`, `npx tsc --noEmit -p pwa/tsconfig.json`) — never a whole-repo pass, and never `prettier`, whose every finding `make fmt` fixes at the end for free.

## The iteration workflow: simulate, screenshot, look

This project is tuned by measuring, not guessing:

1. **`make sim`** before and after every handling/generator change. The table (pace, drifts, clean exits, air time, respawns) is the regression surface — bots must keep finishing and keep drifting.
2. **`make track`** to LOOK at what the rules engine builds.
3. **`make screenshots`** to LOOK at the game itself (grid, speed, drift, every camera on the ladder, the cockpit by day and by night, portrait). In Claude web sessions Chromium is preinstalled — `CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots`.
4. **`make items`** to LOOK at one thing on its own — a stone, a fern, the cabin behind the glass. Most of what the world is made of is six pixels at the speed you pass it; this is where it gets rotated and measured. `ITEMS=` picks the rows, `GROUP=` a whole kind, `TURNTABLE=` the seats to walk round.
5. **`make profile`** before and after every rendering change. Draw calls, triangles and binds are the numbers a real GPU sees; the fps it also prints is software rasterization and means nothing off this machine.

Both harnesses serve `pwa/dist`, so **`make build` first, every time**: a stale
dist photographs and meters the last change rather than this one, and the
picture that comes back is wrong in a way that reads as a bug in the code.

## Commit and PR conventions

- Conventional commits (`feat(engine): …`, `fix(pwa): …`); enforced by the `commit-msg` hook. Squash-merge: the PR title becomes the commit subject on `main`, so it must be a conventional subject too.
- Every user-visible change ships a changeset fragment in `.changes/unreleased/` (`<unix-ts>-<slug>.md` with `type:` front matter). **Never edit CHANGELOG.md** — the release workflow writes it.
- Full workflow details: [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture summary

Three layers, one direction of dependency (details: [docs/architecture.md](docs/architecture.md)):

- **`engine/`** — the whole game as a framework-free, renderer-free TypeScript module. Fixed 120 Hz `step(state, input)`, deterministic per seed (no `Math.random` at runtime — everything draws from the seeded RNG in state). Contains the car model (`game/`), the stage rules engine (`mapgen/`), the bot driver + headless simulator (`sim/`), the §19.4 output module (`output.ts`), and data-authored content (`game/defs/`).
- **`pwa/`** — the browser shell: Preact app, three.js renderer (reads `GameState`, never steps physics), input, HUD, the audio surface (a WebAudio synth, the sound bank, the road bed and the tracker scores — nothing is a file), PWA plumbing (hand-rolled service worker via `pwa-plugin.ts` + the framework's `usePwaUpdate` behind the app's own `update-card.tsx`).
- **`tests/` + `scripts/`** — root-level vitest suites over the engine, and Node tooling (sim CLI, track previews, screenshots, icons, SEO checks, release plumbing).

## Where new code goes

| Kind of change                                              | Where it goes                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Handling/feel (drift, jump, grip, gearbox)                  | `engine/game/car.ts`; numbers in `engine/game/defs/`                                                                             |
| How a turn becomes a drift, and how it lets go              | `TUNING.drift` in `engine/game/defs/tuning.ts` — the `drift-feel` skill                                                          |
| A new car                                                   | A data row in `engine/game/defs/cars.ts` — the `car-tuning` skill                                                                |
| What separates one CAR from another                         | `cars.ts` + `TUNING.drivetrain` — the `car-tuning` skill                                                                         |
| A car's LOOK (silhouette, panels, wheels, livery)           | `pwa/src/game/car-styles.ts` (specs); generator in `pwa/src/game/car/`                                                           |
| What is BEHIND the glass (trim, seats, crew, cage, wheel)   | `pwa/src/game/car/interior.ts` — the `car-design` skill                                                                          |
| What the DRIVER sees: fascia, dials, wheel, pedals, mirror  | `pwa/src/game/car/cockpit.ts` — the player's car only; the deck it needs cut out is `OpenCabin` in `car/shell.ts`                |
| How an IN-CAR camera sits, moves and takes a hit            | `pwa/src/game/camera-eye.ts` (`EYE_RIGS`) — the `game-feel` skill                                                                |
| WHO is behind the wheel (build, hair, helmet, gear colours) | `pwa/src/game/car-crew.ts` (the sixteen, as data); the models are built in `pwa/src/game/car/crew.ts` — the `car-design` skill   |
| What a MAP READER is, and what the pair are wearing         | `MAP_READER` + the crew's `CrewColors` in `pwa/src/game/car-crew.ts` — one model, in the driver's own colours                    |
| How see-through a window is, and what it reflects           | `car/greenhouse.ts` bakes the gradient; `car-mesh.ts` adds the per-frame glint                                                   |
| The head- and tail lamps, and what a LIT one looks like     | `pwa/src/game/car/lamps.ts` builds the bowls; `car-mesh.ts` switches them and blooms them — the `car-design` skill               |
| A PAINT SCHEME an opponent is dressed in                    | `pwa/src/game/car-livery.ts` (palettes + patterns) — the `car-design` skill                                                      |
| A new PART on the car (a light pod, a snorkel, a vent)      | a builder in `pwa/src/game/car/`, driven by an optional `spec.ts` field                                                          |
| The wipers, and the grime on the glass they clear           | `pwa/src/game/car/wipers.ts` — the `car-design` skill                                                                            |
| How dirty the car gets, and where                           | `pwa/src/game/car-dirt.ts`                                                                                                       |
| Stage generation rules or vocabulary                        | `engine/mapgen/rules.ts` (data); the searches in `generate.ts` (sprint, endless) and `circuit.ts` (R22), over `search.ts`        |
| Track geometry/compilation                                  | `engine/mapgen/compile.ts`                                                                                                       |
| Run orchestration (phases, laps, respawn, events)           | `engine/game/step.ts`                                                                                                            |
| Collision / damage (crush, parts, wreck, systems)           | `engine/game/collision.ts` — the `collision` skill                                                                               |
| What a DAMAGED car drives like (power, grip, pull, drag)    | `engine/game/damage.ts` + `TUNING.collision.chassis` — the `collision` skill                                                     |
| Bot behavior                                                | `engine/sim/bot.ts`                                                                                                              |
| How GOOD a bot is (difficulty, skill budgets)               | `engine/sim/skill.ts` — the `bot-improvement` skill                                                                              |
| Who the campaign's rivals ARE (aliases, cars, characters)   | `engine/sim/rivals.ts` — the `bot-improvement` skill                                                                             |
| What a rival is PAINTED (colour, pattern, door number)      | `RIVAL_SCHEMES` in `pwa/src/game/car-livery.ts` — the `car-design` skill                                                         |
| The field on the road, and what place a run is in           | `pwa/src/game/standings.ts` (+ `campaign.ts` for the podium rule)                                                                |
| The rival cars you can see and hit                          | `pwa/src/game/field-cars.ts`; the plate over each one is `name-tag.ts`                                                           |
| The name over a car that is not the player's                | `pwa/src/game/name-tag.ts` — a label, a colour and a point; it must never learn what a bot is                                    |
| Anything drawn (meshes, textures, camera, effects)          | `pwa/src/game/` (renderer.ts and friends)                                                                                        |
| Where the camera stands OUTSIDE the car                     | `CHASE_RIGS` in `pwa/src/game/camera.ts` — one row per angle                                                                     |
| What colour the sky is under given conditions               | `pwa/src/game/sky.ts` (the presets and the weather/season colour maths)                                                          |
| What is IN the sky (cumulus, the overcast deck, scud)       | `pwa/src/game/clouds.ts`                                                                                                         |
| Lightning and the thunder behind it                         | `pwa/src/game/storm.ts` (drawn) + `thunder_*` in `audio/bank.ts` (heard)                                                         |
| How heavy the weather is, and how hard it is coming down    | `pwa/src/game/weather.ts` — read off the wind, and DOM-free so the road bed shares it                                            |
| The rear-view mirror: where the glass sits, how it aims     | `pwa/src/game/mirror.ts` (its box is restated in `styles.css` — see the parity rules)                                            |
| A particle pool the car throws off, and how it is tinted    | `pwa/src/game/car-fx.ts`; WHEN it is thrown stays in `renderer.ts`                                                               |
| Things the car knocks loose (cones, posts, torn-off parts)  | `pwa/src/game/cones.ts`, `kerbs.ts`, `car-damage.ts`, over `tumble.ts` — renderer-side; the engine knows nothing of them         |
| Anything HEARD (a hit, a landing, a menu click)             | `pwa/src/game/audio/bank.ts` (+ a rung in `route.ts`) — the `sound-effects` skill                                                |
| A continuous sound (engine, tyres, wind, the slide)         | `engine-bed.ts` / `road-grain.ts` in `pwa/src/game/audio/`                                                                       |
| A piece of MUSIC                                            | `pwa/src/game/audio/scores/` — the `soundtrack` skill                                                                            |
| HUD readouts (dials, boards, calls)                         | `pwa/src/game/hud.tsx` + `pwa/src/styles.css`                                                                                    |
| The TOUCH controls — the wheel and the pedal thumb zones    | `pwa/src/game/hud-touch.tsx`; a zone's grip on a finger is `thumb-guard.ts`, what a drag MEANS is `pedal-gesture.ts`             |
| Which gears a thumb flick may take, and why a key may not   | `pwa/src/game/shift-window.ts` — DOM-free, and the shift light reads off it too                                                  |
| Input mapping                                               | `pwa/src/game/input.ts` (bindings in `settings.ts`)                                                                              |
| A CONTROLLER: its sticks, its triggers, what its buttons do | `pwa/src/game/gamepad.ts` reads a polled pad (DOM-free); `input.ts` does the polling, bindings in `settings.ts`                  |
| Walking a MENU on a controller                              | `pwa/src/game/menu-nav.ts` (the cards, and `data-nav-back`) over `menu-cursor.ts` (where the cursor goes — DOM-free)             |
| Main menu pages / routing                                   | `pwa/src/game/main-menu.tsx` (+ `menu-roam`, `menu-options`, `menu-car`)                                                         |
| The pre-race card: car, spec sheet, gearbox                 | `pwa/src/game/menu-car.tsx`; the numbers on it in `car-stats.ts` (derived from the catalog)                                      |
| Campaign stages, locations, points, unlocks                 | `pwa/src/game/campaign.ts` — one board: the points a stage pays ARE what opens the next stage and the next location              |
| The mass-start GRID, and the only catch-up in the game      | `engine/sim/grid.ts` + `TUNING.massStart` — the zig-zag on the apron, and the drive a row back is owed                           |
| The HEADS UP page and its three settings                    | `pwa/src/game/menu-headsup.tsx`; the stage boxes all three grids share are `pwa/src/game/menu-levels.tsx`                        |
| The standings sheet, drawn                                  | `pwa/src/game/results-table.tsx` (the results card's modal and the menu's own table)                                             |
| The time trial's high score board and its initials          | `pwa/src/game/scores.ts` (storage) + `score-board.tsx` / `hud-initials.tsx`                                                      |
| The time trial's ghost: recording, replay, storage          | `pwa/src/game/ghost.ts`                                                                                                          |
| Taking a picture, and what is stamped on it                 | `pwa/src/game/screenshots.ts` (the canvas work) + `shot-plan.ts` (size, name, where the mark goes — DOM-free)                    |
| The roll of pictures, and sending one on                    | `pwa/src/lib/shot-store.ts` over `shot-roll.ts`; the share/copy/save probes in `pwa/src/lib/share-image.ts`                      |
| The gallery the pictures are browsed in                     | `pwa/src/game/menu-gallery.tsx`                                                                                                  |
| The marking beside the road, and what a block COSTS to cut  | `engine/mapgen/kerbs.ts` places every marker (one is solid); `pwa/src/game/kerbs.ts` draws them — the `mapgen-improvement` skill |
| Where the split boards stand on a stage (R28)               | `STAGE_RULES.checkpoint` + the placement in `engine/mapgen/compile.ts` — the `mapgen-improvement` skill                          |
| What a split is measured against, and where a respawn lands | `engine/game/track.ts` (`lastCheckpoint`) + `pwa/src/game/standings.ts` (the field's leader)                                     |
| A player option (HUD, video, controls)                      | `pwa/src/game/settings.ts`, then its reader                                                                                      |
| The debug overlay, god mode, the debug log                  | `pwa/src/game/debug-*.ts(x)`, `camera-free.ts`, `menu-dev.tsx` — the `debug-tools` skill                                         |
| The studio card / boot cover                                | `pwa/src/game/splash.ts` (policy) + `splash-screen.tsx`                                                                          |
| App identity (name, palette, URLs)                          | `pwa/src/identity.ts` (single source)                                                                                            |
| New CLI tooling                                             | `scripts/*.mjs` (Node, no deps beyond `scripts/lib/`)                                                                            |
| Engine tests                                                | `tests/<topic>_test.ts`                                                                                                          |

**Hard rules:** the engine never imports three.js, Preact, or anything from `pwa/`; the renderer never mutates `GameState`; engine randomness only via the state's seeded RNG (determinism is test-enforced); source files stay under 1000 lines. **The game ships no audio files** — every sound and every note is synthesized from authored parameters, and `pwa/src/lib/synth.ts` is the only module that touches WebAudio (everything that merely DESCRIBES a sound imports `lib/voice.ts`, which is DOM-free so the bank and the tests can read it).

## Test conventions

- Tests live in the root `tests/` directory, one file per topic, named `<topic>_test.ts` (the `_test` suffix is mandated by OSS_SPEC §20.2 and checked by the validator).
- Runner: vitest via `make test`; config in `vitest.config.ts` (alias `@engine` → `engine/index.ts`). No DOM, no browser — engine tests only.
- Physics tests build synthetic tracks via `compileTrack(seed, segments)` and script inputs step by step; widen the injected track's `width` when a scenario slides far sideways.
- Simulation tests use `simulateStage` — deterministic, so digests can be compared exactly.
- No extra test dependencies; everything runs on plain Node.

## Documentation sync points

| When this changes                          | Update this                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Handling model / tuning                    | `docs/driving.md`                                                                            |
| Generator rules (`engine/mapgen/rules.ts`) | `docs/track-generator.md` (rules are listed verbatim)                                        |
| Bot, sim harness, rival skill model        | `docs/simulation.md`                                                                         |
| The sound bank, the beds, or a score       | `docs/audio.md`                                                                              |
| The sky, the weather, or the storm         | `docs/architecture.md` (the atmosphere bullet), then `make sky` and read the sheet           |
| Commands / npm scripts / Make targets      | README Usage table + this file's command block                                               |
| The debug overlay's REPRO line             | `App.tsx`'s URL readers — writer and reader move together, or a screenshot stops reproducing |
| App identity, domain, deploy slots         | `pwa/src/identity.ts`, README, `docs/configuration.md`, `pwa/public/*` SEO files             |
| Cars, controls, install flow               | README (What/Usage) + `docs/getting-started.md`                                              |
| Shell/platform plans                       | `docs/platforms.md`                                                                          |

## Parity and cross-cutting rules

- `pwa/src/identity.ts` is the identity source of truth; `pwa/public/icons/icon.svg` and `scripts/generate-icons.mjs` encode the same mark geometry — change one, change both, then `make icons`.
- The menu's backdrop is the real game: `App.tsx` steps the engine on `botInput` under the drone camera while a menu page is up, and holds it under the map camera on Roam. A menu that stops driving is a bug, not a saving.
- `engine/version.ts`, root and workspace `package.json` versions move together — only via `scripts/update-versions.sh` (the release workflow runs it).
- The service worker contract (cache id, emitted files) is shared between `pwa/pwa-plugin.ts` and `pwa/src/app-pwa.ts` — keep them agreeing.
- `pwa/src/game/mirror.ts` places the rear-view glass from a width, a top offset and an aspect; `.hud` in `pwa/src/styles.css` restates the same three so the co-driver's calls hang under the glass instead of across it. The strip is a canvas pass and the calls are DOM, so there is no shared measurement to read — change one, change both.
- `make profile` counts a FRAME as an animation callback that drew something, not as a `gl.clear`. A frame is not one three.js `render()`: the driving frame issues two, the map view draws its pane over a cleared canvas, and the mirror fills its own target first. Anything that adds a pass must not go back to counting clears, or every per-frame number in the table halves and the fps doubles.
- The deployed site IS the product (§11.2-as-webapp): there is no separate `website/` tree. SEO copy lives in `pwa/index.html` + `pwa/public/`; keep it in sync with identity.ts, and treat a stale deployed site after identity/feature changes as a bug.

## Skills

Skills live in `.agent/skills/` (`.claude/skills` symlinks there) — each a `SKILL.md` playbook. Load the one that owns the task's SUBJECT, plus the workflow ones its steps name. This file is the router; the procedures live in the skills.

**Session workflow** (every task):

- **`start-work`** — the preflight: clean tree, sync with `origin/main`, the deliver-by-default contract.
- **`write-code`** — how code is written here: comments, the edit loop, file caps, test conventions, aliases. Load beside the subject skill on any code change.
- **`skill-reflection`** — read each loaded skill's lessons at the start (`node scripts/skill-lessons.mjs <skill>`), record/prune/promote at the end.
- **`changelog`** → **`commit`** — the fragment-or-label call, then gates, push, PR. **`conflict`** whenever a branch moves onto another.

**Craft** (the subject owners):

- **`game-feel`** — how the game FEELS: the sensation of speed and the drift as drama. Owns the Sega Rally reference, the camera, and the cross-system levers (speed × stage scale × framing × FX). Load it whenever the acceptance test is "does it feel right".
- **`drift-feel`** — how the car turns and slides: the hand-over from a
  gripped turn into a drift, how deep a given lock goes, and how a slide lets
  go. Owns the `TUNING.drift` knob group and the response-curve probe.
- **`engine-system`** — adding/changing a gameplay system, engine-first.
- **`collision`** — the car hitting things: contact model, crush and bent
  polygons, breaking parts, internal-system damage, the wreck, the solid
  trunks, the ground as a solid, the springs the body rides on, and the HUD
  damage instrument.
- **`mapgen-improvement`** — the stage generator (rules/search/geometry, the R-rules).
- **`bot-improvement`** — the bot driver in `engine/sim/bot.ts`.
- **`simulate-run`** — measuring balance with `make sim`; owns reading the table.
- **`debug-game`** / **`test-scenario`** — deterministic repros; staging exact situations on synthetic tracks.
- **`debug-tools`** — the in-game developer tools: god mode's free camera,
  the debug overlay and the REPRO line that turns a screenshot into a frame
  anyone can stand in, the debug log, and `make debug-shot`. Load it when a
  problem arrives as a PICTURE rather than as a repro.
- **`playtest`** / **`ui-review`** — looking at the real game (`make screenshots`); the HUD fit-and-finish sweep.
- **`visual-effects`** — transient FX in the three.js world and the HUD layer.
- **`sound-effects`** — what the game SOUNDS like moment to moment: the bank,
  the event route, and the continuous beds (engine, tyres, wind, the drift's
  scrub). Everything is synthesized; the target register is PSX, not chip.
- **`soundtrack`** — the music: tracker scores for the menu and the stage, and
  the listen-with-the-voices-muted loop that is the only way to judge one.
- **`car-tuning`** — what separates one CAR from another: the catalog, the
  drivetrain and engine tables, and the roster-balance sweep that proves no
  car is best everywhere.
- **`car-design`** — how the cars LOOK: the parametric body builder, the per-car specs, the field's paint schemes (including what each named rival is painted), the sixteen crew characters behind the glass, and the `make cars` / `make liveries` / `make field` / `make crew` render-compare-iterate loop.
- **`nature`** — the biomes, trees and flora, ground cover, terrain paint, and the rally-gate dressing: the world the road runs through.

**Maintenance** (each with a `.last-updated` baseline):

- **`maintenance`** — the umbrella: dispatches every `update-*` skill in registry order after big merges or on a cadence.
- **`update-docs`** / **`update-readme`** / **`update-website`** / **`update-prompts`** — re-sync `docs/*.md`, README.md, the SEO/identity shell, and `prompts/` against their sources of truth.
- **`sync-oss-spec`** — walk OSS_SPEC.md's mandates against the repo; the closing step of a full sweep.

Run the specific skill when you know what drifted; run `maintenance` when you don't.
