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
- **Don't** add artificial imperfection (steering jitter, reaction delay,
  time penalties, rubber banding). We want the bot to STOP doing dumb things,
  not to fake being bad. This holds for the campaign's EASY field too: an
  easy rival is slow because it plans corners at a speed a nervous driver
  plans them at and makes a nervous driver's mistakes, not because anything
  was taken away from it after the fact.
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
  (the track samples, the car, the progress index), with ONE exception, and
  it is the shape any other memory should copy: `scars.ts` keeps what this
  driver has already come unstuck on in a module-level `WeakMap` keyed on the
  `GameState` object. Never a field on `GameState`, and never something the
  caller threads — a caller that forgets to thread a memory silently gets the
  bug the memory exists to prevent.
- The bot **never reaches into physics internals** — it reads the same state
  the HUD reads and produces the same `CarInput` a thumb produces. A bot that
  peeks at un-exported model internals is a bot that lies about drivability.

## The knobs: `BotProfile`

The tunables live as data on `BotProfile` (`latFraction`, `steerGain`,
`lookahead`, `planHorizon`, `hardCurvature`, `hotEntry`, `rotationRef`,
`brakeMargin`, `brakeUse`, `reverseAfter`, `reverseSpeed`, `offRoadGiveUp`,
`overtake`, `aggression`), with `RALLY_BOT` as the shipped default. Slower or
faster brains are **new profiles, not code forks** — a "cautious" or
"flat-out" probe is a profile literal handed to `simulateStage`, and the
decision code stays one function.

**A profile is never hand-written for the game itself.** The campaign's
fourteen rivals come out of the SKILL MODEL (`engine/sim/skill.ts`): six
skill axes with a points budget in front of them, a difficulty being one
number and a crew being a way of spending it (`engine/sim/rivals.ts`).

Adding a knob to `BotProfile` is the moment to ask **whether it is a skill at
all**, and there are only two right answers:

- **It makes the car quicker, monotonically.** Then an axis owns it, and a
  knob no axis moves is a knob no rival can ever have. Measure with
  `npm run sim -- --field`.
- **It is TEMPERAMENT** — true of `overtake` and `aggression`, the two that
  say what a crew does about other cars. Neither is monotone in pace (a crew
  who finishes having put three cars in the trees is not a better driver), so
  neither can be an axis without breaking the budget's one promise. It comes
  off the CREW instead (`RivalCrew.overtake` / `.temper`), scaled by a band
  the difficulty sets (`temperFor`). Measure with `make heat`.

Forcing a temperament knob onto an axis is the failure mode here: it makes
the hard field the polite one or the easy field the vicious one, and no
amount of budget tuning fixes it.

Before an axis is given a range, SWEEP THE KNOB it moves: one knob at a time
against `RALLY_BOT` over several stages and all three cars, printing the time
as a ratio. Half of what looks like a skill turns out to be flat (the bot's
`planHorizon` does nothing above about a second, because the corner plan is
already distance-discounted) and some of it runs the other way (a bigger
`brakeMargin` is FASTER — on gravel the quick crews barely brake, the slide
scrubs the speed). An axis built on a guess is a difficulty dial that does
not move.

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
   Then the SCARS (`scars.ts`): a respawn puts the car back at the last board
   in an identical state, so a driver who learned nothing drives the same
   line into the same corner forever. A place that ended a run is planned at
   a fraction of the speed that ended it, less again each time it does it
   again — and the flick and the drift throttle, which both overrule the
   plan, stand down there.
6. **Air** — line the nose up with the travel direction for the landing;
   no throttle, no brake.
7. **Gears** — shifts the manual by the same speed thresholds the auto box
   uses (`TUNING.gearbox.upAt`/`downAt`), so both cars simulate fairly.
8. **Traffic** — handed the cars near it, the bot moves its aim off the crown
   to go round the one in front, queues behind it when the road will not take
   the move, and leans on it if its temper says so. Handed nothing, every one
   of the seven steps above runs exactly as it always did.

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

## Calibrating a DIFFICULTY (`skill.ts`, `rivals.ts`)

A different question from "does the bot drive well", and the sim table cannot
answer it: a difficulty is a promise made to a PERSON, and every column above
is bots measuring bots. Use a **run tape** — one whole run written down as the
controls that drove it (`docs/simulation.md`):

```sh
make record SEED=42 CAR=compact DIFFICULTY=hard   # a reference lap, one command
make replay RUN=runs/<file>.jsonl DIFFICULTY=easy,medium,hard
```

Better still, drive one yourself: developer menu → **COLLECT RACE DATA**, then
SAVE RUN DATA on the results card. Read the PLACE column and the gap to the
podium cut: hard is right when a good drive is off the podium and a great one
is on it, and wrong when it is unreachable or free.

Two things about the tool that are true every time. **The `drift` on the
reproduced line is the validity check** — anything but ~0 m means the handling
moved under the recording and every place below it is somebody else's car.
And **a tape is never re-driven against a field it did not meet**: it is a
blind driver, so `placeAmongField` races the crews alone and slots the time
in instead. Do not "fix" that by re-racing it.

## After a change

- `make lint && make test` green; `make sim` table in the PR (before/after).
- A `skill.ts` or `rivals.ts` change owes the `--field` table AND the same
  tape replayed before and after — the table says what the budgets bought,
  the tape says what that did to a person.
- **The retirement column in `make heat` is signal now** — a run that cannot
  be finished, not a crew trapped at one board. Chase a new one; the wider
  read is 25 seeds x three difficulties with respawns counted per PLACE
  (a repeat inside 40 m is the loop coming back).
- **A traffic or temper change owes `make heat` instead** — and owes a
  `make sim` table that has not moved AT ALL. A bot handed no traffic must
  drive the stage it always drove, so a byte-identical sweep is the proof the
  change is contained; `make heat` is the only table where the behaviour
  actually fires.
- A bot change is a changelog call, not a `no-changelog` reflex: the bot
  drives every rival the player races (`field.ts`) and the menu's backdrop.
  A decision change a player would notice on the road in front of them
  gets a fragment; a probe, a harness column or a knob nobody ships does
  not.
- The campaign's field is GHOSTS (`FieldPlan.contact: false`): its crews
  are handed no traffic, cannot be touched, and are written down before
  the green (`trace.ts`). The traffic eyes and the tempers fire only on a
  solid field — heads-up and `make heat` — so a campaign complaint about
  a rival's driving is never about `overtake` or `aggression`.
- Load **`skill-reflection`** before committing: record what this pass
  learned, prune the stale, promote the always-true into the model
  description above.
