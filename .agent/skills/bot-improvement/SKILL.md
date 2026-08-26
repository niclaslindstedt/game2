---
name: bot-improvement
description: "Use when improving the BOT DRIVER (engine/sim/bot.ts) — how the bot reads the stage and drives. Drives the iterate loop: reproduce the bad behaviour with the sim at a known seed, form a hypothesis from the geometry and the event log, edit the decision code and/or the BotProfile numbers, then re-measure. The target is HUMAN capability — the bot should drive like a skilled rally driver (brake for corners, flick hairpins into drifts, manage the slide, line up landings), never something a human never would. No artificial handicaps — just competent, deterministic driving."
---

# Bot improvement

The bot in `engine/sim/bot.ts` is one source of truth: the headless simulator
(`engine/sim/simulate.ts`), the balance CLI (`scripts/simulate-run.mjs` /
`make sim`), and the sim tests all drive the SAME
`botInput(state, profile) → CarInput`. Improving the bot means improving that
function so a botted run drives like a **skilled human rally driver** — the
yardstick for every change. The bot is also the balance instrument: if it
stops drifting hairpins, drift regressions stop showing in the sim table, so
its competence is load-bearing for the whole measuring workflow.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs bot-improvement --list`, then the ones this
task touches (`--scope=…`, `--concepts=…`). Load **`skill-reflection`** at
both ends of the session.

## The target: human capability, no handicaps

Tune toward the decisions a good rally driver makes, not toward superhuman
precision and not toward deliberate mistakes:

- **Do** follow the road ahead, brake down to a corner's speed, enter hard
  corners hot and flick the handbrake to rotate (that is rally style — the
  drift scrubs the excess), power through the slide and counter-steer out,
  breathe the throttle when the angle gets deep, line the nose up with travel
  before landing, and slow right down to recover when off the road.
- **Don't** add artificial imperfection (steering jitter, reaction delay). We
  want the bot to STOP doing dumb things, not to fake being bad.
- **Don't** let it do what a human never would: brake mid-air, hold full
  throttle into a hairpin without a plan, fight a drift with full counter from
  the first degree of slip, or grind along the grass at pace.

If a rally driver wouldn't do it, the bot shouldn't. That is the whole spec.

## Determinism is non-negotiable

The bot is a PURE consumer of `GameState`: it never mutates it and never draws
from the state's RNG, so a botted run is exactly as reproducible as a recorded
human one (same seed + car + profile → identical digest —
`tests/simulation_test.ts` asserts this). Keep it that way:

- No `Math.random()`, no wall clock, no reads of the state's RNG.
- `botInput` is stateless — everything the bot knows is in the `GameState`
  (the track samples, the car, the progress index). If a heuristic needs
  memory, that is a deliberate design change: add a bot-owned object threaded
  by the caller, never a field on `GameState`.
- The bot **never reaches into physics internals** — it reads the same state
  the HUD reads and produces the same `CarInput` a thumb produces. A bot that
  peeks at un-exported model internals is a bot that lies about drivability.

## The knobs: `BotProfile`

The tunables live as data on `BotProfile` (`latAccel`, `steerGain`,
`lookahead`, `planHorizon`, `hardCurvature`, `brakeMargin`), with `RALLY_BOT`
as the shipped default. Slower or faster brains are **new profiles, not code
forks** — a "cautious" or "flat-out" probe is a profile literal handed to
`simulateStage`, and the decision code stays one function.

Prefer moving a magic number out of `botInput`'s body into the profile over
hard-coding it, so it's tunable (and sweepable) next time. Keep the profile to
knobs the code actually reads.

## The current driving model (so you don't re-derive it)

1. **Aim** — a lookahead point on the centerline, speed-scaled
   (`u × lookahead`, floored); steering is proportional to the angle error.
2. **Corner-speed plan** — scans curvature over `planHorizon`; each corner
   caps speed at `√(latAccel/κ)`, distance-discounted by braking capability.
   Corners tighter than `hardCurvature` are planned HOT — the margin is
   **additive** (a few m/s over the cap), because a ratio would overcook
   exactly the tightest hairpins, where the cap is smallest.
3. **The flick** — arriving hot at a hard corner pulls the handbrake once
   (not while already drifting or airborne).
4. **Drift management** — power through the slide, half throttle when the
   angle is deep, counter-steer blended in only once the nose is nearly on
   the aim (damping earlier is what runs a drift wide).
5. **Recovery** — off the road: throttle off, brake down, let the aim pull
   the nose back. Sliding along the verge at pace is how a car gets lost.
6. **Air** — line the nose up with the travel direction for the landing;
   no throttle, no brake.
7. **Gears** — shifts the manual by the same speed thresholds the auto box
   uses (`TUNING.gearbox.upAt`/`downAt`), so both cars simulate fairly.

## The iterate loop

1. **Reproduce.** `npm run sim -- --seeds <N> --car <id>` at the failing
   seed — read the row (respawns, off-road time, DNF) and the event log via a
   scratch `simulateStage` call if the sequence matters.
2. **Look at the geometry.** `npm run track -- --seeds <N>` renders the stage
   — see WHAT the bot fought (a hairpin after a crest? a jump into a turn?)
   before hypothesizing. A bot failure on legal geometry is a bot bug; illegal
   geometry is the generator's (`mapgen-improvement`).
3. **Hypothesize, then edit** `engine/sim/bot.ts` (logic) and/or the profile
   (a number).
4. **Re-measure.** The failing seed first, then the full `make sim` sweep —
   both cars, all seeds. One lucky seed proves nothing; the sweep's footer is
   the before/after. Watch for the coupling: a "bot fix" that changes the
   handling's measured balance is retuning the instrument mid-experiment.
5. **Run `make test`** — the sim tests pin finish/pace/drift/digest contracts.
6. **Look at it** when the change is about style rather than survival:
   `make screenshots` won't show the bot driving (the screenshot script
   scripts keyboard input), but the sim's drift/air columns are the style
   read — a bot that finishes without drifting has stopped playing the game.

## After a change

- `make lint && make test` green; `make sim` table in the PR (before/after).
- Bot changes are usually `no-changelog` (players never see the bot today —
  it exists headless); the moment a bot drives something player-facing (a
  demo mode, a ghost car), that changes.
- Load **`skill-reflection`** before committing: record what this pass
  learned, prune the stale, promote the always-true into the model
  description above.
