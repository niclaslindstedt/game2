---
name: simulate-run
description: "Use to measure the game's ACTUAL balance by running the real engine headlessly — bot-driven stages across seeds and cars, reporting pace, drifts, clean exits, drift score, jumps, air time, fords, off-road time, respawns, and top speed. The closing measurement loop of every handling or generator change: run it before and after, read the diff, and paste both tables in the PR. Also the owner of what the table's columns mean and which movements are regressions."
---

# Simulate Run

The sim is the balance team's wind tunnel: it drives the REAL engine —
`createGame`, `step`, the bot driver — at full speed with no renderer, and
reports what actually happened. Nothing in it models or approximates a rule;
it IS the rules, run fast. **Balancing this game means balancing pace and
feel-as-measured** — do bots finish, do they drift the hairpins, do they fly
the jumps, do they stay on the road — not tuning an economy: there is no XP,
no loot, no difficulty ladder here. The regression surface is the table.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs simulate-run --list`, then the ones this task
touches. Reading them here and reflecting on them before the commit is the
**`skill-reflection`** skill's job — load it at both ends of the session.

## The tools

- **Engine module: `engine/sim/simulate.ts`** — `simulateStage({ seed, carId,
profile, maxTime })`. Deterministic per options; returns a typed `SimResult`
  (finish state, race time, track length, the run stats, the whole event log,
  and the **digest** — an FNV hash over sampled positions, the determinism
  fingerprint).
- **CLI: `scripts/simulate-run.mjs`** — runs the sweep and prints the table.

```sh
make sim                              # seeds 1..8, both cars — the standard sweep
npm run sim -- --seeds 42,99          # specific seeds (e.g. a bug report's)
npm run sim -- --car classic          # one car
npm run sim -- --count 20             # a wider sweep for a tuning decision
npm run sim -- --json report.json     # machine-readable dump (events stripped)
```

The CLI **exits non-zero if any run failed to finish**, so CI's `simulate` job
doubles as a smoke alarm — a tuning change that strands a bot goes red without
anyone reading the table.

## Reading the table

One row per seed × car:

| Column       | Meaning                                           | Healthy movement                                                                   |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `len`        | Stage length, m                                   | Inside the R11 band (~1200–2000)                                                   |
| `time`       | Race time, s                                      | Tracks length; a blow-up means the bot got lost                                    |
| `avg`        | Average pace, km/h                                | Rally territory — see the band `tests/simulation_test.ts` pins                     |
| `drift`      | Drift count                                       | **> 0 on stages with hard corners** — a zero here means the flick or entry broke   |
| `clean`      | Clean exits (drifts that held and paid the boost) | A healthy share of `drift`; collapsing to 0 means exits stopped paying             |
| `dTime`      | Total seconds spent drifting                      | The sideways-time read — the game's whole point                                    |
| `score`      | Drift score (`\|slip\| × speed × time`)           | Sideways AND fast; score falling while `dTime` holds means slides got slow         |
| `jump`/`air` | Takeoffs and airborne seconds                     | **> 0 on stages with lips** — zero air on a jump stage means lips stopped throwing |
| `ford`       | Splashes                                          | Present when the stage has water                                                   |
| `off`        | Off-road seconds                                  | Small; growing means the bot (or the handling) stopped holding the road            |
| `resp`       | Respawns                                          | **≈ 0** — the contract is at most one recovery per run                             |
| `top`        | Top speed, km/h                                   | Differs by car (the manual's taller top should show)                               |
| `fin`        | Finished                                          | **yes, every row** — a `NO` is a failure, full stop                                |

The footer aggregates: finished count, average pace, average drift time,
average air time, total respawns — the one-line before/after comparison.

## The workflow rule

**Run `make sim` before and after every handling or generator change, and
paste both tables in the PR description.** This is the contract in
CONTRIBUTING.md and the PR template. A change that makes bots stop finishing
or stop drifting is a regression until argued otherwise — and the argument
happens in the PR, over the two tables, explicitly.

## The roster balance table (`npm run sim -- --sweep`)

`make sim` races ONE set of dials over one pool of seeds, so it ranks the
cars exactly once — and one car being fastest on every stage in the game is
invisible to it. `--sweep` races the whole roster over five stage archetypes
(`tarmac`, `mountain`, `mixed`, `wet`, `gravel`) and ranks them per
archetype, warning loudly if a single car takes all five.

**Any change to `engine/game/defs/cars.ts` owes this table**, before and
after, in the PR beside the plain one. Read it for three things: every car
winning at least one archetype, the specialists winning their home ground by
MORE than the all-rounder wins the middle, and nobody worst everywhere.

## The knob loop

1. **Baseline**: `make sim` on the clean tree (or `--json baseline.json` for a
   wider sweep you'll want to diff mechanically).
2. **Edit the knob** — `engine/game/defs/tuning.ts` (global feel) or
   `cars.ts` (per car). Never inline in the model; the `engine-system` skill
   owns where numbers live.
3. **Re-run and read the diff.** Did the change move what you intended — and
   nothing you didn't? A grip change that also halves air time is telling you
   the systems are coupled; understand why before shipping.
4. **Hold seeds fixed while dialing one knob**, then confirm across the full
   sweep. Runs are chaotic: one different drift early cascades into a
   different run, so a single-seed A/B proves nothing — the standard sweep
   (8 seeds × 2 cars) is the decision-grade read.
5. **Check both cars.** A knob that fixes the auto's drift can break the
   manual's — the sweep runs both by default; keep it that way.
6. Run `make test` — `tests/simulation_test.ts` pins the contract (bots finish
   with either car with at most one recovery, pace stays in the band, hard
   corners get drifted, jump stages get flown, digests reproduce). If a tuning
   change breaks one of these, **the change is wrong or the test's world just
   moved — decide which explicitly, never silently.**
7. Finish with the `playtest` skill — the simulator measures numbers, never
   fun. A change can pass every band and still feel wrong at 60fps.

## Caveats — what a bot run does and doesn't measure

- **The bot is a probe, not a proof of fun.** It plays like a competent
  human (see `bot-improvement`); it measures pace, drift usage, and whether
  the stage is drivable — it cannot measure whether the drift feels good.
- **Determinism is the instrument's calibration.** Same seed + car + profile
  ⇒ same digest. If two runs of the same options diverge, stop tuning: the
  engine has a nondeterminism bug (see `debug-game`), and every measurement is
  noise until it's fixed.
- **The bot and the handling are coupled.** A handling change can look like a
  regression because the BOT no longer suits the car (e.g. its corner-speed
  model assumes grip you removed). Decide whether the fix belongs in
  `tuning.ts` or in `engine/sim/bot.ts` — the `bot-improvement` skill — and
  say which in the PR.
- **Generator changes are measured here too**: a rules edit that produces
  legal-but-undrivable geometry shows up as respawns and DNFs long before a
  human drives it. Pair with `make track` to look at the stages the sweep
  drove (the `mapgen-improvement` skill).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. Settled
balance reads ("respawns above N always trace to X", a column movement that
reliably diagnoses a cause) are exactly what belongs here — recorded as
fragments, promoted into the table above once they hold every time.
