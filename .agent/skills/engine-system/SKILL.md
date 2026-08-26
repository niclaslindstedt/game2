---
name: engine-system
description: "Use when adding or changing a gameplay system (a surface type, a stage feature's physics, a scoring rule, a car capability, run phases, respawn rules…). Walks the engine-first workflow: tune defs, extend state/events, implement in the fixed-timestep step pipeline, test headlessly, measure with the sim, then wire rendering and HUD in the app layer."
---

# Adding a Gameplay System

Gameplay lives in the **engine** (`engine/`, framework-free TypeScript); the
**app** (`pwa/`) only draws state and reacts to events. Keep that direction:
the engine never knows a renderer exists. This is what makes every game rule
unit-testable in plain Node, and every run reproducible from a seed.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs engine-system --list`, then the ones this task
touches (`--scope=…`, `--concepts=…`). Reading them here and reflecting on them
before the commit is the **`skill-reflection`** skill's job — load it at both
ends of the session. Load **`write-code`** beside this one on every system
change — it owns the craft rules (comments, file caps, the edit loop).

## Where the pieces go

| Piece                                                                    | File                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Global feel tuning (drift, jump, grip, gearbox, respawn thresholds)      | `engine/game/defs/tuning.ts` — units in the comments (m, m/s, s, rad); never inline in the model                |
| Per-car numbers, or a new car                                            | A data row in `engine/game/defs/cars.ts` — the model never branches per car                                     |
| State shapes & events                                                    | `engine/game/state.ts` — `GameState`, `CarInput`, the `GameEvent` union                                         |
| The handling model (grounded + airborne, drift state machine, gearboxes) | `engine/game/car.ts`                                                                                            |
| Run orchestration (phases, progress, respawns, finish, event emission)   | `engine/game/step.ts` — `createGame` and the fixed 120 Hz `step`                                                |
| Car-to-track queries (progress, lateral offset, surface, lips)           | `engine/game/track.ts`                                                                                          |
| Stage generation rules / vocabulary                                      | `engine/mapgen/rules.ts` + `generate.ts` + `compile.ts` — the `mapgen-improvement` skill                        |
| Bot behavior                                                             | `engine/sim/bot.ts` — the `bot-improvement` skill                                                               |
| Generic helpers (any game could use)                                     | `engine/lib/` — the pool a later game keeps as-is                                                               |
| Public surface                                                           | `engine/index.ts` — export new types/constants the app or tests need                                            |
| Tests                                                                    | `tests/<topic>_test.ts` (vitest, `@engine` alias, synthetic tracks — see the `test-scenario` skill)             |
| Anything drawn                                                           | `pwa/src/game/` (`renderer.ts`, `world.ts`, `car-mesh.ts`, `dust.ts`, `camera.ts`) — the `visual-effects` skill |
| HUD / touch controls                                                     | `pwa/src/game/hud.tsx` + `pwa/src/styles.css`                                                                   |
| Input mapping                                                            | `pwa/src/game/input.ts`                                                                                         |

## Workflow

1. **Defs first.** Add the system's numbers to `engine/game/defs/tuning.ts`
   (global feel) or `cars.ts` (per car), with units in the comments. If you
   can't express the knob there, the design isn't ready. The model reads the
   defs; it never hard-codes a number.
2. **Types.** Extend `engine/game/state.ts`. Anything the app must react to
   (a splash, a shift, a landing) becomes a `GameEvent` variant — events are
   the ONLY channel from simulation to presentation. `step()` returns the
   events that step emitted, so the app never misses or double-plays one.
3. **Simulate.** Implement the rule in `car.ts` (per-tick vehicle physics) or
   `step.ts` (run orchestration), inside the fixed 120 Hz timestep. Mutate
   state in place; respect the run phases (countdown / racing / finished).
   Keep per-tick allocation near zero — `step()` runs 120×/s and the sim
   harness runs it far faster than that.
4. **Test headlessly** in `tests/`: build a synthetic track with
   `compileTrack(seed, segments)`, run scripted inputs step by step, assert on
   state + events (see the `test-scenario` skill for the staging recipes).
   Every rule you claim ("a token flick pays no boost") gets an assertion.
   `npx vitest run tests/<file>` to iterate.
5. **Export** what the app needs from `engine/index.ts`.
6. **Measure.** `make sim` before and after — the balance table is the
   regression surface, and bots must keep finishing and keep drifting (the
   `simulate-run` skill reads the table). A new system that changes what a
   run looks like usually also earns a stat column or an event in the sim
   report.
7. **Present.** Wire the events and state into the renderer/HUD in
   `pwa/src/game/` — the `visual-effects` skill for anything drawn, `hud.tsx`
   for readouts. The renderer reads `GameState`; it never steps physics and
   never mutates state.
8. **Playtest** with the `playtest` skill (`make screenshots`) — numbers that
   look right in a test can still read wrong at speed in the real renderer.

## Invariants to preserve

- `step()` must stay deterministic for (seed, input sequence) — no wall clock,
  no `Math.random`, no DOM. Everything random draws from the seeded RNG in the
  state (`engine/lib/prng.ts`). The sim digests
  (`tests/simulation_test.ts`) enforce this: break determinism and they fail.
- The engine imports nothing from `pwa/` and nothing from three.js or Preact;
  the app imports `@engine` and nothing deeper.
- The timestep is fixed (`TUNING.dt`, 120 Hz). The app's loop accumulates real
  time into fixed steps — never make a rule depend on frame rate.
- Docs move with the code per `AGENTS.md`'s sync table: handling changes
  update `docs/driving.md`, generator changes `docs/track-generator.md`,
  sim/bot changes `docs/simulation.md`; a new command updates the README.
- A user-visible change ships a `.changes/unreleased/` fragment (the
  `changelog` skill).

## Skill self-improvement

Load the **`skill-reflection`** skill at both ends of the session — it owns
recording what a pass learned (with a `scope` and `concepts`), fixing anything
here the pass proved WRONG, pruning the stale, merging the duplicated, and
promoting the always-true. When a new system forces a pattern not covered here
(a new surface type, a timed hazard, a scoring multiplier…), record where it
landed and why.
