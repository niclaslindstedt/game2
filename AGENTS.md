# Agent guidance for Scandinavian Flick (game2)

This file is the canonical source of truth for AI coding agents working in this repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`, and `.github/copilot-instructions.md` are symlinks to it.

**This file is the ROUTER, not the manual.** It says how work is done here, where things live at one level of detail, and which skill owns the rest. The procedures — every loop, every lab, every craft rule — live in `.agents/skills/`. Load the skill that owns the task's SUBJECT before starting; do not re-derive from this file what a skill already states.

This repository conforms to [`OSS_SPEC.md`](OSS_SPEC.md) (the committed copy is the version the repo was last validated against; `bash <(curl -fsSL https://raw.githubusercontent.com/niclaslindstedt/oss-spec/main/scripts/validate.sh) .` re-checks and refreshes it). When in doubt about layout, naming, or workflow conventions, the spec is the tie-breaker.

## Build and test commands

```sh
npm install       # needs a GitHub Packages read token — see below
make build        # typecheck + production build (pwa/dist/)
make test         # vitest over the engine (SHARD=i/N slices it; CI runs ten)
make lint         # eslint + typecheck, zero warnings
make fmt          # prettier in place; fmt-check is what CI runs
make hooks        # install pre-commit + commit-msg hooks
make icons        # regenerate icons/favicon/og.png AND native/assets/ from the app mark
make check-seo    # build + structural SEO/PWA/bundle assertions
```

That is the everyday set. **The full list — every lab, every preview tool, what each one prints — is the README's Usage table, and the `Makefile` is the authority.** The table below says which of them a given change OWES.

`@niclaslindstedt/oss-framework` resolves from GitHub Packages, which requires auth even for public reads. Web sessions: `.claude/hooks/session-start.sh` writes the token from the environment (`GITHUB_PAT` et al.) into `~/.npmrc` and installs dependencies automatically. Locally: add `//npm.pkg.github.com/:_authToken=<token>` to your own `~/.npmrc`.

**Scope the linter, never the typechecker, and leave the suite to CI.** `npx eslint <changed files>` is 2 s where the whole repo is 24; `npx tsc --noEmit` is 3 s and must stay whole-program, because it checks a PROGRAM (naming files makes it ignore `tsconfig.json`) and because a changed signature breaks its CALLERS — the files you did not touch.

**`make fmt` is the Make target to run; `make test` is CI's.** The whole suite is a thousand cases and thirteen minutes serially, and the PR runs it sharded across ten runners on every push and reports in about a minute — so locally, run the FILES that cover the change (`npx vitest run tests/<topic>_test.ts`) and let the PR find the rest. The Make target is still the definition of green; it is just not worth running here to learn what ten parallel runners are about to say.

## The labs: what to run before and after which change

This project is tuned by measuring and LOOKING, not guessing. Each lab below is REQUIRED before and after a change in its subject — run it, keep both outputs, and put them in the PR. The owning skill says how to read what comes back.

| Change you are making        | Run                                     | Owner                         |
| ---------------------------- | --------------------------------------- | ----------------------------- |
| Handling, generator, balance | `sim`                                   | `simulate-run`                |
| The drift model              | `drift`                                 | `drift-feel`                  |
| A roll, a trip, a contact    | `crash`, `roll`                         | `crash`                       |
| The ground under the car     | `verge`                                 | `crash`                       |
| Damage: how it reads / draws | `health`, `wrecks`, `wheel`             | `collision`                   |
| The stage generator          | `analyze`, `track`, `level`, `previews` | `mapgen-improvement`          |
| Bot traffic or temper        | `heat`                                  | `bot-improvement`             |
| Difficulty                   | `record`, `replay`                      | `bot-improvement`             |
| A car's look                 | `cars`, `liveries`, `field`, `crew`     | `car-design`                  |
| One prop or item             | `items`, `items-list`                   | `built-world`                 |
| The sky, weather, aircraft   | `sky`, `traffic`                        | `atmosphere`                  |
| The camera                   | `views`, `transit`, `rollcam`           | `game-feel`                   |
| Anything heard               | `audition`                              | `sound-effects`, `soundtrack` |
| The HUD or a menu            | `screenshots`, `glyphs`                 | `hud-and-menus`, `ui-review`  |
| Anything rendered            | `profile`                               | `write-code`                  |
| A bug that arrived as a shot | `debug-shot`                            | `debug-tools`                 |
| The desktop or store app     | `tauri*`, `native-*`, `desktop`         | `platform-shells`             |

Both harnesses serve `pwa/dist`, so **`make build` first, every time**: a stale dist photographs and meters the last change rather than this one, and the picture that comes back is wrong in a way that reads as a bug in the code. In Claude web sessions Chromium is preinstalled — prefix the browser-driven ones with `CHROMIUM_PATH=/opt/pw-browsers/chromium`.

Two of these are worth knowing about even when they are not your subject:

- **`make level LEVEL=1`** reasons about ONE stage without driving it — every call, jump, split, surface and roadside solid labelled by id, in a couple of seconds, no build and no browser. A claim about "the first jump on level 1" is a claim about `J1` there.
- **`make profile`** counts what a real GPU sees (draw calls, triangles, binds). The fps beside them is software rasterization and means nothing off this machine; judge a change structurally — a new pass? a new material? or only an instance count? — before reading small movement as a regression.

**When a report arrives as a `[STAGE] … [REPRO]` block**, that block is not context to read past: it is the repro, copied off the game's own debug overlay, and it exists so the frame in the picture can be stood in again. Never reason about such a report from the prose and the picture alone — paste the query string into `make debug-shot REPRO='?seed=38&…'`, check the overlay rows it prints against the block you were handed, and load `debug-tools`, which owns the rest of the loop.

## How work is done here

Rules that apply to every task, before any subject skill has a say. They are restated here from the skills that own them because a session that gets them wrong gets them wrong from its first tool call:

- **Lint, typecheck and format ONCE, at the gate — not after every edit.** `make fmt` and `make lint` are the commit's gate (the `commit` skill owns the split). Re-running them between one edit and the next re-checks code nobody touched and tells you nothing; batch the whole coherent change, then check it. Mid-loop, if a specific answer is genuinely needed, check only the files you touched (`npx eslint <paths>`, `npx tsc --noEmit -p pwa/tsconfig.json`) — never a whole-repo pass, and never `prettier`, whose every finding `make fmt` fixes at the end for free.
- **TEST WHAT YOU WROTE; THE PR TESTS THE REST.** Run the suites that cover the change and the ones it plausibly reaches, by file, and push — a red PR is a normal state and a follow-up commit costs nothing, where ten minutes of local suite before every push costs ten minutes every time. Two things to be honest about: a change to `TUNING`, `car.ts`, `sim/` or the generator reaches tests three directories away (a drift retune has gone red in `tape_test`, `water_test` and `analysis_test` at once), so name the topics generously for those; and a red PR is work NOW, not something to leave sitting.
- **THIS REPOSITORY IS PUBLIC — no personal details go in it.** Team ids, account names, tokens, keys, device ids, e-mail addresses, absolute paths under a home directory: none of them are committed, not even the ones that are identifiers rather than secrets, and not as a "default" a contributor can override. Everything of that kind is read from the ENVIRONMENT — a gitignored `.env` beside the tree that needs it (with the committed `.env.example` documenting where the value comes from and what shape it is), and GitHub repository **secrets** for credentials or **variables** for identifiers on CI. Code that needs such a value reads it, checks it early, and fails with a message naming the file to put it in; it never invents one. The published app's own identifiers (`APP_NAME`, the bundle id) are the deliberate exception — they are the product's public name, and they live in `pwa/src/identity.ts`.
- **Every work session ends by committing its work with the `commit` skill.** Once the requested change and its gates are complete, load and follow that skill to make a conventional commit; when working in a worktree, follow its required sync step afterward.

## Commit and PR conventions

- Conventional commits (`feat(engine): …`, `fix(pwa): …`); enforced by the `commit-msg` hook. Squash-merge: the PR title becomes the commit subject on `main`, so it must be a conventional subject too.
- Every user-visible change ships a changeset fragment in `.changes/unreleased/` (`<unix-ts>-<slug>.md` with `type:` front matter). **Never edit CHANGELOG.md** — the release workflow writes it.
- Full workflow details: [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture summary

Three layers, one direction of dependency (details: [docs/architecture.md](docs/architecture.md)):

- **`engine/`** — the whole game as a framework-free, renderer-free TypeScript module. Fixed 120 Hz `step(state, input)` (`TUNING.physicsHz`, with the bot's own decision rate beside it as `TUNING.botHz` — both knobs, both shipping at 120), deterministic per seed (no `Math.random` at runtime — everything draws from the seeded RNG in state). Contains the car model (`game/`), the stage rules engine (`mapgen/`), the bot driver + headless simulator (`sim/`), the generator's scoreboard (`analysis/` — dev-time only, never imported by the app), the §19.4 output module (`output.ts`), and data-authored content (`game/defs/`).
- **`pwa/`** — the browser shell: Preact app, three.js renderer (reads `GameState`, never steps physics), input, HUD, the audio surface (a WebAudio synth, the sound bank, the road bed and the tracker scores — nothing is a file), PWA plumbing (hand-rolled service worker via `pwa-plugin.ts` + the framework's `usePwaUpdate` behind the app's own `update-button.tsx`).
- **`tests/` + `scripts/`** — root-level vitest suites over the engine, and Node tooling (sim CLI, track previews, screenshots, icons, SEO checks, release plumbing).

Beside them, OUTSIDE the npm workspace and outside the root suite's path, the two shells that wrap the built site — **`tauri/`** (the desktop app: two Rust crates, `shell/` every decision and `src-tauri/` every effect) and **`native/`** (the App Store / Play Store app: an Expo WebView over a bundled copy of the site). **Nothing in `engine/` may learn either exists, and the ONE line of `pwa/` that does is `pwa/src/shell-host.ts`.** A feature a shell needs is a feature the website needs first. The `platform-shells` skill owns both, along with `tauri/README.md` and `native/README.md`.

**Hard rules:** the engine never imports three.js, Preact, or anything from `pwa/`; the renderer never mutates `GameState`; engine randomness only via the state's seeded RNG (determinism is test-enforced); source files stay under 1000 lines. **The game ships no audio files** — every sound and every note is synthesized from authored parameters, and `pwa/src/lib/synth.ts` is the only module that touches WebAudio (everything that merely DESCRIBES a sound imports `lib/voice.ts`, which is DOM-free so the bank and the tests can read it).

## Where new code goes

By area first. Each row's skill owns the file-by-file map inside that area — go there rather than guessing from a directory name.

| Area                                   | Lives in                               | Skill                |
| -------------------------------------- | -------------------------------------- | -------------------- |
| Handling and feel (drift, grip, gears) | `engine/game/car.ts`, `defs/`          | `drift-feel`         |
| What separates one car from another    | `engine/game/defs/cars.ts`             | `car-tuning`         |
| Rolling, tripping, going over          | `engine/game/roll.ts`                  | `crash`              |
| Hitting things, damage, the wreck      | `engine/game/collision.ts`             | `collision`          |
| The stage generator and its ground     | `engine/mapgen/`                       | `mapgen-improvement` |
| How a stage is scored                  | `engine/analysis/`                     | `mapgen-improvement` |
| The bot, the field, the rivals         | `engine/sim/`                          | `bot-improvement`    |
| A whole new gameplay system            | engine first, then `pwa/`              | `engine-system`      |
| How a car looks, inside and out        | `pwa/src/game/car-styles.ts`, `car/`   | `car-design`         |
| A car remade after a real one          | photographs → `car-styles.ts`          | `car-creation`       |
| The camera, anywhere                   | `pwa/src/game/camera*.ts`              | `game-feel`          |
| The sky, light, weather, water look    | `pwa/src/game/sky.ts` and kin          | `atmosphere`         |
| Biomes, flora, ground cover, terrain   | `pwa/src/game/flora*.ts`, `terrain.ts` | `nature`             |
| What people put beside the road        | `engine/mapgen/` + `pwa/src/game/`     | `built-world`        |
| Transient effects the car throws off   | `pwa/src/game/car-fx.ts` and kin       | `visual-effects`     |
| HUD, menus, input, settings, photos    | `pwa/src/game/hud*.tsx`, `menu-*`      | `hud-and-menus`      |
| Anything heard                         | `pwa/src/game/audio/`                  | `sound-effects`      |
| A piece of music                       | `pwa/src/game/audio/scores/`           | `soundtrack`         |
| The developer tools and the overlay    | `pwa/src/game/debug-*`                 | `debug-tools`        |
| The desktop or store app               | `tauri/`, `native/`                    | `platform-shells`    |

And the pieces that belong to no skill in particular:

| Kind of change                                    | Where it goes                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run orchestration (phases, laps, respawn, events) | `engine/game/step.ts`                                                                                                                                        |
| Track geometry / compilation                      | `engine/mapgen/compile.ts`                                                                                                                                   |
| What a surface does to the car                    | `TUNING.surfaces`; a country's loose surface is `BiomeRules.loose`                                                                                           |
| Anything drawn, with no better home               | `pwa/src/game/` (`renderer.ts` and friends)                                                                                                                  |
| What a RACE COSTS TO STAND UP, and its card       | `pwa/src/game/race-loader.ts` (the steps and the frame budget, DOM-free) + `loading-screen.tsx`; the steps themselves are `App.tsx`'s `beginLoad`            |
| The APP MARK, wherever the app draws one          | `pwa/src/game/app-mark.ts` (the two tracks as data) → `mark-tracks.tsx` (laid, once or over and over); `tests/app_mark_test.ts` holds it to `icons/icon.svg` |
| App identity (name, palette, URLs)                | `pwa/src/identity.ts` — the single source                                                                                                                    |
| How much GPU a phone or tablet has                | `pwa/src/game/device-gpu.ts` — published Geekbench scores, family fallbacks for a device it has never heard of, and bands; read by nothing yet               |
| A Node script needing an app module               | `aliasEngine` in `scripts/lib/engine-alias.mjs` before the `import()` — never a Vite build to read a table                                                   |
| New CLI tooling                                   | `scripts/*.mjs` (Node, no deps beyond `scripts/lib/`)                                                                                                        |
| Engine tests                                      | `tests/<topic>_test.ts`                                                                                                                                      |

### Stated once — never restate these

Each of these is the one place an answer is written down. Anything that needs it ASKS; a second copy is a bug the day one of them moves.

- **What a car CAN do** — `engine/game/limits.ts`, read by `car.ts` AND `sim/bot.ts`. Never restate a ceiling.
- **What the speedo reads** — `travelSpeed` in `engine/game/state.ts`: speed through space, vertical included. `snapshot.ts` and `car-instruments.ts` both read it and neither restates it.
- **Whether the car has fully come back** — `CarState.planted` (four wheels, level), written at `car.ts`'s `air.leanFree` branch and read by the roll camera.
- **What a split is measured against** — `lastCheckpoint` in `engine/game/track.ts`.
- **Where the ear is** — `pwa/src/game/audio/listener.ts`, one row per camera; the beds and the router both read it.
- **A figure that counts to its new value** — `pwa/src/lib/count.ts` is the easing ONLY; the caller owns the clock, which is what keeps it DOM-free and testable.
- **The name over a car that is not the player's** — `pwa/src/game/name-tag.ts` takes a label, a colour and a point, and must never learn what a bot is.
- **A car that only STANDS there** — `pwa/src/game/parked-car.ts`, a dozen boxes from one roll; never the catalog's builder, which is a thousand times the geometry.

## Test conventions

- Tests live in the root `tests/` directory, one file per topic, named `<topic>_test.ts` (mandated by OSS_SPEC §20.2 and checked by the validator).
- Runner: vitest via `make test`; config in `vitest.config.ts` (alias `@engine` → `engine/index.ts`). No DOM, no browser — engine tests only.
- Physics tests build synthetic tracks via `compileTrack(seed, segments)` and script inputs step by step; widen the injected track's `width` when a scenario slides far sideways. Simulation tests use `simulateStage` — deterministic, so digests compare exactly. The `test-scenario` skill owns staging an exact situation.
- **A file that asserts a dozen rules over the same spread of seeds takes its stages from `tests/support/stages.ts`** (`stagePlans`, `stageTrack`, `stageTerrain`) rather than generating them per `it`. The generator is deterministic per seed, so the second build can only return the first one's answer, and building one is the most expensive thing the engine does — written literally, one rule suite was the same twenty-four stages built seven times and four minutes of CI's critical path. What comes back is SHARED and read-only; anything needing its own build (an endless stage it will `extend()`, a determinism check that has to see two independent builds) calls the engine directly.
- **Sharding splits at FILE granularity, so the slowest single file is the floor under `make test` on CI.** Keep a test file under a minute: share the corpus, and split a file whose subject is really two (`mapgen_test` / `mapgen_bands_test` / `mapgen_dials_test`, `water_test` / `drown_test`).
- **Running them:** `make test` is the whole suite (`SHARD=i/N` runs one slice, which is how CI fans it out across ten runners); `npx vitest run tests/<topic>_test.ts` runs one file, which is what you run locally.
- No extra test dependencies; everything runs on plain Node.

## Documentation sync points

| When this changes                     | Update this                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Handling model / tuning               | `docs/driving.md`                                              |
| Generator rules (`mapgen/rules.ts`)   | `docs/track-generator.md` (verbatim), then `make previews`     |
| A campaign level (`campaign.ts`)      | `make previews` — the boxes and banners are generator output   |
| Bot, sim harness, rival skill model   | `docs/simulation.md`                                           |
| The sound bank, the beds, or a score  | `docs/audio.md`                                                |
| The sky, weather, storm or aircraft   | `docs/architecture.md`, then `make sky` / `make traffic`       |
| Commands / npm scripts / Make targets | README Usage table + this file's labs table                    |
| The debug overlay's REPRO line        | `App.tsx`'s URL readers — writer and reader move together      |
| App identity, domain, deploy slots    | `identity.ts`, README, `docs/configuration.md`, `pwa/public/*` |
| Cars, controls, install flow          | README (What/Usage) + `docs/getting-started.md`                |
| Shell/platform plans                  | `docs/platforms.md`, `tauri/README.md`, `native/README.md`     |

The campaign menu's routes and biome banners are generator OUTPUT, so every rule change re-rolls them: a re-seeded, re-banded or re-lit level otherwise leaves a picture of a stage that no longer exists. Editing the first level of a location, or adding a location, re-shoots that country's banner.

## Parity and cross-cutting rules

Places where one idea is deliberately written in two files that cannot import each other. Each is a live trap: change one, change both.

- `pwa/src/identity.ts` is the identity source of truth; `pwa/public/icons/icon.svg`, `scripts/generate-icons.mjs` and `pwa/src/game/app-mark.ts` encode the same mark geometry — the asset the stores read, the arc centres the raster icons are drawn from, and the same shape as data for the app to draw at runtime. None can import either of the others, so change one and change all three, then `make icons`. `tests/app_mark_test.ts` reads the SVG and holds the data module to it, which is what makes that a check rather than a hope.
- The desktop app's names restate `identity.ts` and cannot import it (`tauri.conf.json`, `tauri/shell/src/config.rs`); `tests/tauri_test.ts` holds all four — see `platform-shells`.
- `engine/version.ts` and the root and workspace `package.json` versions move together — only via `scripts/update-versions.sh` (the release workflow runs it).
- The service worker contract (cache id, emitted files) is shared between `pwa/pwa-plugin.ts` and `pwa/src/app-pwa.ts` — keep them agreeing.
- The rear-view mirror's box is stated in `mirror.ts` and again in `.hud` in `styles.css`; a modal must be a SIBLING of `.menu-card`, never inside it (its `backdrop-filter` makes it the containing block for `position: fixed`). Both are `hud-and-menus`.
- The menu's backdrop is the real game: `App.tsx` steps the engine on `botInput` under the drone camera while a menu page is up. A menu that stops driving is a bug, not a saving.
- `make profile` counts a FRAME as an animation callback that drew something, not as a `gl.clear`. A frame is not one three.js `render()`: the driving frame issues two, the map view draws its pane over a cleared canvas, and the mirror fills its own target first. Anything that adds a pass must not go back to counting clears, or every per-frame number in the table halves and the fps doubles.
- The deployed site IS the product (§11.2-as-webapp): there is no separate `website/` tree. SEO copy lives in `pwa/index.html` + `pwa/public/`; keep it in sync with `identity.ts`, and treat a stale deployed site after identity/feature changes as a bug.

## Skills

Skills live in `.agents/skills/` (`.claude/skills` symlinks there) — each a `SKILL.md` playbook. Load the one that owns the task's SUBJECT, plus the workflow ones its steps name. This file is the router; the procedures live in the skills.

**Session workflow** (every task):

- **`start-work`** — the preflight: clean tree, sync with `origin/main`, the deliver-by-default contract.
- **`write-code`** — how code is written here: comments and the comment-pruning pass, the edit loop, file caps, test conventions, aliases. Load beside the subject skill on any code change.
- **`skill-reflection`** — read each loaded skill's lessons at the start (`node scripts/skill-lessons.mjs <skill>`), record/prune/promote at the end.
- **`changelog`** → **`commit`** — the fragment-or-label call, then gates, push, PR. **`conflict`** whenever a branch moves onto another.

**Craft** (the subject owners):

- **`game-feel`** — how the game FEELS: the sensation of speed and the drift as drama. Owns the Sega Rally reference, the CAMERA in all its rigs, and the cross-system levers. Load it whenever the acceptance test is "does it feel right".
- **`drift-feel`** — how the car turns and slides: the hand-over from a gripped turn into a drift, how deep a given lock goes, how a slide lets go, and the SPIN at the far end of the same model.
- **`crash`** — the car once it is PAST SAVING: the trip, the rollover, what a crash may be charged in momentum, the air and what a fall may do. Load `collision` beside it for what a contact COSTS.
- **`collision`** — the car hitting things: contact model, crush and bent polygons, breaking parts, system damage, the wreck, the ground as a solid, the springs, and the HUD damage instrument.
- **`car-tuning`** / **`car-design`** / **`car-creation`** — what separates one car from another; how a car LOOKS (body, interior, livery, crew); and a car remade after a real one from photographs.
- **`engine-system`** — adding or changing a gameplay system, engine-first.
- **`mapgen-improvement`** — the stage generator (rules/search/geometry, the R-rules, the training ground).
- **`built-world`** — what people put beside the road: homesteads and farms, towns and buildings, car parks, energy and power lines, the railway and its train, public traffic, tunnels, kerbs and split boards.
- **`nature`** — the biomes, trees and flora, ground cover, terrain paint: the world the road runs through.
- **`atmosphere`** — the sky, the sun and its clock, clouds, mist, weather, lightning, the birds and aircraft, and what water and ice look like.
- **`visual-effects`** — transient FX in the three.js world and the HUD layer.
- **`hud-and-menus`** — what the player reads and presses: the HUD, the minimap, touch and pad controls, every menu page, settings, scores, photos.
- **`sound-effects`** / **`soundtrack`** — what the game sounds like moment to moment; and the tracker scores. Everything is synthesized; the register is PSX, not chip.
- **`bot-improvement`** — the bot driver, the difficulty budgets, the rivals and the field.
- **`simulate-run`** — measuring balance with `make sim`; owns reading the table.
- **`platform-shells`** — the desktop app and the store app.
- **`debug-game`** / **`test-scenario`** / **`debug-tools`** — deterministic repros; staging exact situations; and the in-game developer tools for when a problem arrives as a picture.
- **`playtest`** / **`ui-review`** — looking at the real game; the HUD fit-and-finish sweep.

**Maintenance** (each with a `.last-updated` baseline):

- **`maintenance`** — the umbrella: dispatches every `update-*` skill in registry order after big merges or on a cadence.
- **`update-docs`** / **`update-readme`** / **`update-website`** / **`update-prompts`** — re-sync `docs/*.md`, README.md, the SEO/identity shell, and `prompts/` against their sources of truth.
- **`sync-oss-spec`** — walk OSS_SPEC.md's mandates against the repo; the closing step of a full sweep.

Run the specific skill when you know what drifted; run `maintenance` when you don't.
