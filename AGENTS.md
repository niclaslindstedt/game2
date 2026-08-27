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
make screenshots  # drive the built app headlessly, screenshot key moments
make icons        # regenerate icons/favicon/og.png from the app mark
make check-seo    # build + structural SEO/PWA/bundle assertions
make hooks        # install pre-commit + commit-msg hooks
```

`@niclaslindstedt/oss-framework` resolves from GitHub Packages, which requires auth even for public reads. Web sessions: `.claude/hooks/session-start.sh` writes the token from the environment (`GITHUB_PAT` et al.) into `~/.npmrc` and installs dependencies automatically. Locally: add `//npm.pkg.github.com/:_authToken=<token>` to your own `~/.npmrc`.

**Verify with `make test` / `make lint` — never a bare `npx vitest run` habit**: the Make targets are the definition of green that CI enforces.

## The iteration workflow: simulate, screenshot, look

This project is tuned by measuring, not guessing:

1. **`make sim`** before and after every handling/generator change. The table (pace, drifts, clean exits, air time, respawns) is the regression surface — bots must keep finishing and keep drifting.
2. **`make track`** to LOOK at what the rules engine builds.
3. **`make screenshots`** to LOOK at the game itself (grid, speed, drift, hood cam, portrait). In Claude web sessions Chromium is preinstalled — `CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots`.

## Commit and PR conventions

- Conventional commits (`feat(engine): …`, `fix(pwa): …`); enforced by the `commit-msg` hook. Squash-merge: the PR title becomes the commit subject on `main`, so it must be a conventional subject too.
- Every user-visible change ships a changeset fragment in `.changes/unreleased/` (`<unix-ts>-<slug>.md` with `type:` front matter). **Never edit CHANGELOG.md** — the release workflow writes it.
- Full workflow details: [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture summary

Three layers, one direction of dependency (details: [docs/architecture.md](docs/architecture.md)):

- **`engine/`** — the whole game as a framework-free, renderer-free TypeScript module. Fixed 120 Hz `step(state, input)`, deterministic per seed (no `Math.random` at runtime — everything draws from the seeded RNG in state). Contains the car model (`game/`), the stage rules engine (`mapgen/`), the bot driver + headless simulator (`sim/`), the §19.4 output module (`output.ts`), and data-authored content (`game/defs/`).
- **`pwa/`** — the browser shell: Preact app, three.js renderer (reads `GameState`, never steps physics), input, HUD, PWA plumbing (hand-rolled service worker via `pwa-plugin.ts` + the framework's `usePwaUpdate`/`UpdateToast`).
- **`tests/` + `scripts/`** — root-level vitest suites over the engine, and Node tooling (sim CLI, track previews, screenshots, icons, SEO checks, release plumbing).

## Where new code goes

| Kind of change                                     | Where it goes                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Handling/feel (drift, jump, grip, gearbox)         | `engine/game/car.ts`; numbers in `engine/game/defs/`                    |
| How a turn becomes a drift, and how it lets go     | `TUNING.drift` in `engine/game/defs/tuning.ts` — the `drift-feel` skill |
| A new car                                          | A data row in `engine/game/defs/cars.ts`                                |
| A car's LOOK (silhouette, panels, wheels, livery)  | `pwa/src/game/car-styles.ts` (specs); builder in `car-body.ts`          |
| Stage generation rules or vocabulary               | `engine/mapgen/rules.ts` (data) / `generate.ts` (search)                |
| Track geometry/compilation                         | `engine/mapgen/compile.ts`                                              |
| Run orchestration (phases, respawn, events)        | `engine/game/step.ts`                                                   |
| Collision / damage (crush, parts, wreck, systems)  | `engine/game/collision.ts` — the `collision` skill                      |
| Bot behavior                                       | `engine/sim/bot.ts`                                                     |
| Anything drawn (meshes, textures, camera, effects) | `pwa/src/game/` (renderer.ts and friends)                               |
| HUD / touch controls                               | `pwa/src/game/hud.tsx` + `pwa/src/styles.css`                           |
| Input mapping                                      | `pwa/src/game/input.ts` (bindings in `settings.ts`)                     |
| Main menu pages / routing                          | `pwa/src/game/main-menu.tsx` (+ `menu-roam`, `menu-options`)            |
| Campaign stages, locations, unlocks                | `pwa/src/game/campaign.ts`                                              |
| A player option (HUD, video, controls)             | `pwa/src/game/settings.ts`, then its reader                             |
| The studio card / boot cover                       | `pwa/src/game/splash.ts` (policy) + `splash-screen.tsx`                 |
| App identity (name, palette, URLs)                 | `pwa/src/identity.ts` (single source)                                   |
| New CLI tooling                                    | `scripts/*.mjs` (Node, no deps beyond `scripts/lib/`)                   |
| Engine tests                                       | `tests/<topic>_test.ts`                                                 |

**Hard rules:** the engine never imports three.js, Preact, or anything from `pwa/`; the renderer never mutates `GameState`; engine randomness only via the state's seeded RNG (determinism is test-enforced); source files stay under 1000 lines.

## Test conventions

- Tests live in the root `tests/` directory, one file per topic, named `<topic>_test.ts` (the `_test` suffix is mandated by OSS_SPEC §20.2 and checked by the validator).
- Runner: vitest via `make test`; config in `vitest.config.ts` (alias `@engine` → `engine/index.ts`). No DOM, no browser — engine tests only.
- Physics tests build synthetic tracks via `compileTrack(seed, segments)` and script inputs step by step; widen the injected track's `width` when a scenario slides far sideways.
- Simulation tests use `simulateStage` — deterministic, so digests can be compared exactly.
- No extra test dependencies; everything runs on plain Node.

## Documentation sync points

| When this changes                          | Update this                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Handling model / tuning                    | `docs/driving.md`                                                                |
| Generator rules (`engine/mapgen/rules.ts`) | `docs/track-generator.md` (rules are listed verbatim)                            |
| Bot or sim harness                         | `docs/simulation.md`                                                             |
| Commands / npm scripts / Make targets      | README Usage table + this file's command block                                   |
| App identity, domain, deploy slots         | `pwa/src/identity.ts`, README, `docs/configuration.md`, `pwa/public/*` SEO files |
| Cars, controls, install flow               | README (What/Usage) + `docs/getting-started.md`                                  |
| Shell/platform plans                       | `docs/platforms.md`                                                              |

## Parity and cross-cutting rules

- `pwa/src/identity.ts` is the identity source of truth; `pwa/public/icons/icon.svg` and `scripts/generate-icons.mjs` encode the same mark geometry — change one, change both, then `make icons`.
- The menu's backdrop is the real game: `App.tsx` steps the engine on `botInput` under the drone camera while a menu page is up, and holds it under the map camera on Roam. A menu that stops driving is a bug, not a saving.
- `engine/version.ts`, root and workspace `package.json` versions move together — only via `scripts/update-versions.sh` (the release workflow runs it).
- The service worker contract (cache id, emitted files) is shared between `pwa/pwa-plugin.ts` and `pwa/src/app-pwa.ts` — keep them agreeing.
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
  trunks, and the HUD damage instrument.
- **`mapgen-improvement`** — the stage generator (rules/search/geometry, the R-rules).
- **`bot-improvement`** — the bot driver in `engine/sim/bot.ts`.
- **`simulate-run`** — measuring balance with `make sim`; owns reading the table.
- **`debug-game`** / **`test-scenario`** — deterministic repros; staging exact situations on synthetic tracks.
- **`playtest`** / **`ui-review`** — looking at the real game (`make screenshots`); the HUD fit-and-finish sweep.
- **`visual-effects`** — transient FX in the three.js world and the HUD layer.
- **`car-design`** — how the cars LOOK: the parametric body builder, the per-car specs, and the `make cars` render-compare-iterate loop.
- **`nature`** — the biomes, trees and flora, ground cover, terrain paint, and the rally-gate dressing: the world the road runs through.

**Maintenance** (each with a `.last-updated` baseline):

- **`maintenance`** — the umbrella: dispatches every `update-*` skill in registry order after big merges or on a cadence.
- **`update-docs`** / **`update-readme`** / **`update-website`** / **`update-prompts`** — re-sync `docs/*.md`, README.md, the SEO/identity shell, and `prompts/` against their sources of truth.
- **`sync-oss-spec`** — walk OSS_SPEC.md's mandates against the repo; the closing step of a full sweep.

Run the specific skill when you know what drifted; run `maintenance` when you don't.
