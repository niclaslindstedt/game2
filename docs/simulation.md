# Simulation and bots

Handling and generator changes in this repo are **measured**, not eyeballed. The measuring stick is a headless simulation harness that drives the real engine — `createGame`, `step`, the same functions the browser calls — with a bot at the wheel and no renderer attached.

## The bot (`engine/sim/bot.ts`)

A deterministic player stand-in that reads the same `GameState` the HUD reads and produces the same `CarInput` a thumb produces — it must never reach into physics internals. Its brain, in order:

1. **Aim** — a lookahead point on the centerline, speed-scaled; steering is proportional to the angle error.
2. **Corner-speed plan** — scans the curvature ahead; each corner caps speed at `√(a_lat/κ)`, distance-discounted by braking capability. Hard corners are planned HOT (a few m/s over the cap) — rally style: the drift scrubs the excess.
3. **The flick** — arriving hot at a hard corner pulls the handbrake once. So bots drift hairpins the way players do, and drift regressions show up in bot stats.
4. **Drift management** — power through the slide, breathe when the angle gets deep, counter-steer only once the nose is nearly where it should be (damping earlier is what runs a drift wide).
5. **Recovery** — off the grass: slow right down, let the aim pull the nose back.
6. **Gears** — shifts the manual by the same thresholds the auto box uses, so both cars simulate fairly.

Bot profiles are data (`BotProfile`); `RALLY_BOT` is the default. Slower/faster brains are new profiles, not code forks.

## The harness (`engine/sim/simulate.ts`)

`simulateStage({ seed, carId, profile, maxTime })` runs a full stage and returns: finish state and time, the whole event log, the run stats (drift count/time/score, clean exits, jumps, air time, splashes, off-road time, respawns, top speed), and a **digest** — an FNV hash over sampled positions. Runs are deterministic: same seed + car + profile ⇒ same digest, which is exactly what `tests/simulation_test.ts` asserts.

## The CLI

```sh
make sim                              # seeds 1..8, both cars, the balance table
npm run sim -- --seeds 42,99          # specific seeds
npm run sim -- --car classic          # one car
npm run sim -- --count 20             # a wider sweep
npm run sim -- --weather storm        # race in rain/storm wind
npm run sim -- --json report.json     # machine-readable dump
```

The table columns: stage length, time, average pace, drifts / clean exits / drift time / drift score, jumps / air time, fords, off-road time, respawns, top speed, finished. The footer aggregates. **The workflow rule: run it before and after every handling or generator change and paste both tables in the PR.** Exit code is non-zero if any run failed to finish, so CI's `simulate` job doubles as a smoke alarm.

## What the tests pin down

`tests/simulation_test.ts` encodes the contract between generator and handling:

- bots finish every sweep stage with either car, with at most one recovery;
- stage pace stays in rally territory;
- stages with hard corners get drifted, stages with jumps get flown;
- identical runs produce identical digests; different cars produce different runs.

If a tuning change breaks one of these, the change is wrong or the test's world just moved — decide which explicitly, never silently.

## Screenshots close the loop

Numbers say whether the game is _sound_; pictures say whether it _looks and reads_ right. `make screenshots` (scripts/screenshot.mjs) serves the built app, drives it with scripted keyboard input, and captures the grid, full speed, a handbrake drift, the hood cam, and portrait framing into `previews/`. Iterate: change → `make sim` → `make screenshots` → look.
