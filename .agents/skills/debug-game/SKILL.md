---
name: debug-game
description: "Use when investigating a gameplay bug, physics glitch, visual problem, or crash. Covers reproducing deterministically with a seed plus a scripted input sequence, classifying by layer (engine vs renderer vs input), reading the engine's output module, and locking the fix with a failing test first."
---

# Debugging the Game

The engine is deterministic by construction: `createGame({ seed, carId })` +
a fixed sequence of `step(state, input)` calls always produces the same run —
same stage, same physics, same events. Almost every gameplay bug can therefore
be reduced to a **seed + input script**, reproduced headlessly, and locked in
with a test. Prefer that route over clicking around in a browser. The stage
seed shows in the HUD, so a bug report's seed is the repro's first ingredient.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs debug-game --list`, then the ones this task
touches (`--scope=…`, `--concepts=…`). Reading them here and reflecting on them
before the commit is the **`skill-reflection`** skill's job — load it at both
ends of the session.

## Instruments

| Instrument          | How                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic repro | `createGame({ seed, carId, skipCountdown: true })` + fixed `step()` loops in a scratch vitest file — or a synthetic track via the `test-scenario` skill                                |
| Bot repro           | `simulateStage({ seed, carId })` (`engine/sim/simulate.ts`) — a whole botted run, headless, with the full event log and stats in the result                                            |
| Determinism check   | The `digest` in `SimResult` — two runs of the same seed/car/profile must hash identically; a digest drift IS the bug report for nondeterminism                                         |
| Engine log          | `engine/output.ts` — the semantic output module (`status/info/warn/error/debug`) with a pluggable sink; in the browser it feeds the framework log store via `pwa/src/output-bridge.ts` |
| Stage geometry      | `make track` / `npm run track -- --seeds N` — render the stage the seed builds and LOOK at where the bug happened                                                                      |
| The real renderer   | `make screenshots` (the `playtest` skill), or `npm run dev` headed — for anything only pixels can show                                                                                 |

## Process

1. **Classify by layer first:**
   - **engine bug** → state values are wrong (position NaN, speed exploding,
     `drifting` stuck, phase never reaching `finished`). Reproduce headlessly;
     the renderer is not involved.
   - **render bug** → state right, pixels wrong (road ribbon gaps, car mesh
     orientation, camera pops, dust anchored wrong). The renderer reads
     `GameState` and never writes it — if the sim numbers are right and the
     screen is wrong, the bug is in `pwa/src/game/`.
   - **input bug** → `CarInput` wrong before the engine ever sees it (check
     `pwa/src/game/input.ts` and the touch HUD's mapping in `hud.tsx`).
   - **generator bug** → the stage itself is illegal or ugly (a rule
     violated, a crossing centerline). That is the `mapgen-improvement`
     skill's loop — `make track` first.
2. **Engine bugs: write the failing test BEFORE the fix.** Arrange the exact
   scenario in `tests/` — a synthetic track shaped for the bug
   (`compileTrack(seed, segments)`, see the `test-scenario` skill), scripted
   inputs stepped until the bad state appears — assert the correct behavior,
   watch it fail, then fix `engine/game/*`. The test stays forever; the bug
   can't return silently. Name it after the behavior, not the bug number.
3. **Physics bugs that only bots hit:** reproduce with `simulateStage` at the
   reported seed, then read the event log in the result — the sequence of
   `driftStart`/`takeoff`/`respawn` events usually names the moment things
   went wrong, and `make track` shows the geometry it happened on.
4. **Render bugs:** reproduce with `make screenshots` (add a scene to
   `scripts/screenshot.mjs` if none captures the moment), and compare against
   the sim's numbers for the same instant to separate "state is wrong" from
   "drawn wrong".
5. **Nondeterminism** (digest drift, daily stage differing between devices):
   the cause is almost always a draw outside the state's seeded RNG or a
   wall-clock read inside the engine. Grep `engine/` for `Math.random` and
   `Date.now` first — both are banned there.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. What is
worth a fragment here is the diagnosed root-cause _class_ (a layer-classifying
tell, a repro technique), never the one-off bug.

```sh
node scripts/skill-lessons.mjs debug-game --list
```
