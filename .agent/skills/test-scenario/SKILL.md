---
name: test-scenario
description: "Use when a bug repro, a physics assertion, or a visual judgement needs the game in an EXACT situation — a drift held at full lock on a dead straight, a jump taken at a known speed, a ford entered sideways, a hairpin approached hot. Covers staging synthetic tracks with compileTrack(seed, segments), scripting inputs step by step, and driving the built app to a staged moment with the screenshot tool."
---

# Test Scenarios

Playing your way into a situation is slow and unrepeatable. This repo stages
situations **declaratively** instead: hand the engine a synthetic track shaped
for the scenario, and script the inputs step by step. The same technique backs
every physics test (`tests/drift_test.ts`, `jump_test.ts`, `gearbox_test.ts`)
— reuse it whenever you are reproducing a bug, asserting a rule, or measuring
a number.

## The synthetic track

`compileTrack(seed, segments)` compiles a hand-authored `SegmentPlan[]`
instead of a generated stage — the segments bypass the generator entirely, so
the scenario contains exactly what you put in it:

```ts
import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1500, feature: "none" }];

function game(carId = "compact"): GameState {
  // A drift slides the car tens of meters sideways; widen the test road so
  // the mechanics are measured, not the off-road respawn.
  const track = { ...compileTrack(0, STRAIGHT), width: 120 };
  return createGame({ seed: 0, carId, skipCountdown: true, track });
}
```

The segment vocabulary is `SegmentPlan` (`engine/mapgen/rules.ts`): straights
and turns (with `dir`, `radius`, `severity`), and per-segment features
(`jump` with `featureStart`/`featureEnd`/`lipHeight`, `water`, `crest`).
Nothing validates a hand-authored plan against the R-rules — that is the
point: a scenario may stage geometry the generator would never build.

## Scripting inputs

Drive the state with a fixed-step helper; seconds → steps via `TUNING.dt`:

```ts
function run(state: GameState, input: Partial<CarInput>, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, { ...NEUTRAL_INPUT, ...input }));
  }
  return events;
}
```

Collect the returned events — they are the assertion surface for anything
transitional (`driftStart`, `driftEnd`, `takeoff`, `landing`, `splash`,
`shift`, `respawn`, `finish`).

## Rules of thumb

- **Stage, don't play.** If a repro starts with "drive to the third hairpin",
  replace the drive with a track whose first corner IS that hairpin — a short
  opening straight to build speed, then the corner.
- **Silence what you're not testing.** A dead straight isolates the drift
  state machine; `width: 120` keeps the off-road respawn out of a slide test;
  `skipCountdown: true` removes the grid hold from every timing.
- **Build the precondition, then assert you built it.** The drift tests run
  `run(state, { throttle: 1 }, 4)` and then `expect(state.car.u).toBeGreaterThan(
TUNING.drift.minSpeed)` before flicking — so a tuning change that slows the
  car fails loudly at the precondition instead of silently passing a test
  whose scenario never happened.
- **Reference thresholds from `TUNING`, not copied literals** — the test then
  tracks the tuning instead of pinning yesterday's numbers.
- **One scenario per behavior, named after the behavior.** The repro for a bug
  becomes the regression test; keep it in the topic's `tests/<topic>_test.ts`.
- **Whole-run scenarios** (does a bot survive this geometry?) go through
  `simulateStage` with a real seed instead — see the `simulate-run` skill.

## Staging in the real renderer

For a visual judgement (does the spray read? does the drift angle show on
camera?), the equivalent of a scenario is a **scene** in
`scripts/screenshot.mjs`: scripted keyboard input against the built app —
hold throttle N seconds, flick the handbrake, screenshot. Add a scene for the
moment you need (`--scene <name>` selects one) and run it via
`make screenshots` (the `playtest` skill has the loop and the environment
notes). The screenshot script drives `pwa/dist`, so `make build` first.

## Skill self-improvement

When a staging need doesn't fit the current engine surface (a scenario that
wants the car placed mid-track at speed, a track override the API can't
express), grow the engine's create/track surface plus its test, then document
the option here. Recurring stagings and gotchas are lesson fragments — load
the **`skill-reflection`** skill at both ends of the session
(`node scripts/skill-lessons.mjs test-scenario --list`).
