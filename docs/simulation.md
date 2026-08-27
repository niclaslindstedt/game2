# Simulation and bots

Handling and generator changes in this repo are **measured**, not eyeballed. The measuring stick is a headless simulation harness that drives the real engine — `createGame`, `step`, the same functions the browser calls — with a bot at the wheel and no renderer attached.

## The bot (`engine/sim/bot.ts`)

A deterministic player stand-in that reads the same `GameState` the HUD reads and produces the same `CarInput` a thumb produces — it must never reach into physics internals. Its brain, in order:

1. **Aim** — a lookahead point on the centerline, speed-scaled; steering is proportional to the angle error.
2. **Corner-speed plan** — scans the curvature ahead; each corner caps speed at `√(a_lat/κ)`, distance-discounted by braking capability. `a_lat` is a FRACTION of the car's own lateral grip (`latFraction × gripAccel`), not a fixed number, so the same brain plans honestly in either car — and because the slide comes in relative to that same ceiling, this one knob is what decides whether the bot ever drifts a corner or only ever flicks the handbrake at one. Hard corners are planned HOT (a few m/s over the cap) — rally style: the drift scrubs the excess.
3. **The flick** — arriving hot at a hard corner pulls the handbrake once, unsticking the rear. So bots drift hairpins the way players do, and drift regressions show up in bot stats.
4. **Drift management** — power through the slide, breathe when the angle gets deep, and steer where the car is GOING rather than where its nose is pointing: sideways, holding the nose on the lookahead puts the velocity off the road by exactly the slip angle, so the aim error is measured against the direction of travel. Counter-steer damps the rotation only once the nose is nearly where it should be (damping earlier is what runs a drift wide).
5. **Recovery** — out in the wild: cruise back toward the road at a pace the nature surface can steer at, and fire the reset input when the excursion is hopeless (out too long), like a player would.
6. **Backing out** — pinned against something with the throttle buried for `reverseAfter`, the bot stops pushing and reverses off it, wheel straight, until the car is properly moving (`reverseSpeed`); then it takes another run at the line. Being WEDGED is no longer a reason to reset: a driver backs off the trunk first, and the respawn is what happens when that fails too. The manoeuvre latches on the car's own `reversing` state so a single wedged tick cannot flicker it, and reversing counts as asking to move (`stepStuck`), so a car pinned both ways still reaches the engine's wedge rescue on time instead of braking forever.
7. **Gears** — shifts the manual by the same thresholds the auto box uses, so both cars simulate fairly.

Bot profiles are data (`BotProfile`); `RALLY_BOT` is the default. Slower/faster brains are new profiles, not code forks.

## The harness (`engine/sim/simulate.ts`)

`simulateStage({ seed, carId, profile, length, shape, laps, maxTime })` runs a full stage (at a finite stage length band — default medium) and returns: finish state and time, the laps raced and each lap's time, one lap of road (`trackLength`) and the ground the race actually covered (`raceLength`), the whole event log, the run stats (drift count/time/score, jumps, air time, clean landings, splashes, off-road time, impacts, crashes, respawns, top speed), and a **digest** — an FNV hash over sampled positions. Runs are deterministic: same seed + car + profile ⇒ same digest, which is exactly what `tests/simulation_test.ts` asserts. `shape: "circuit"` races a closed lap over three of them (R22); a sprint is one lap of a road that never comes back, and asking for more laps of one does nothing.

## The CLI

```sh
make sim                              # seeds 1..8, both cars, the balance table
npm run sim -- --seeds 42,99          # specific seeds
npm run sim -- --car classic          # one car
npm run sim -- --count 20             # a wider sweep
npm run sim -- --length long          # stage length band (default medium)
npm run sim -- --shape circuit        # race a closed lap circuit (R22)
npm run sim -- --shape circuit --laps 5
npm run sim -- --weather storm        # race in rain/storm wind
npm run sim -- --asphalt 0.8          # the generator's dials, each 0..1:
                                      # --elevation --water --trees --asphalt
npm run sim -- --json report.json     # machine-readable dump
```

The dials change what the stage IS, so they change the table: tarmac buys pace and costs drift time (that is what it is FOR), water and hills cost both. Sweep one at a time — a dial moved with a handling change makes the diff unreadable.

The table columns: the ground covered (one lap × the laps on a circuit), time, average pace, drifts / drift time / drift score, jumps / air time, fords, off-road time, hits (damaging impacts — trees, boulders, slammed landings), respawns (crash respawns and bot resets both land here), top speed, finished. The footer aggregates. **The workflow rule: run it before and after every handling or generator change and paste both tables in the PR.** Exit code is non-zero if any run failed to finish, so CI's `simulate` job doubles as a smoke alarm.

## What the tests pin down

`tests/simulation_test.ts` encodes the contract between generator and handling:

- bots finish every sweep stage with either car, with at most one recovery;
- stage pace stays in rally territory;
- stages with hard corners get drifted, stages with jumps get flown;
- identical runs produce identical digests; different cars produce different runs.

If a tuning change breaks one of these, the change is wrong or the test's world just moved — decide which explicitly, never silently.

## Screenshots close the loop

Numbers say whether the game is _sound_; pictures say whether it _looks and reads_ right. `make screenshots` (scripts/screenshot.mjs) serves the built app, drives it with scripted keyboard input, and captures the grid, full speed, a drift, the first jump reached, the sealed-road trio, every camera angle (plus the distant three mid-turn, where their sway shows), the lap clock mid-circuit, the results card, and portrait framing into `previews/`. Pass scene-name fragments on the command line to shoot only those. Iterate: change → `make sim` → `make screenshots` → look.

Two habits keep a scene pointed at what it is for rather than at the harness:

- **Drive by the run's clock, not the wall clock.** Under software rendering the engine advances at a fraction of real time, so a `waitForTimeout` lands somewhere different on the stage on every machine. The scene helpers read the HUD instead — the timer, the speed, the co-driver's call and its distance — so "out on the sealed road", "on open road", "stopped" and "at the turn-in" mean what they say.
- **A circuit is how a scene reaches a lap board.** `?shape=circuit&laps=2` (with `?bot=1` driving) puts a run past its own start line inside a screenshot's patience, which is the only way to photograph the lap clock or a results card with laps on it.
- **`?bot=1` rides out, the script takes the wheel.** Blind key presses only ever reach the first corner, and anything the generator places further in (a sealed section, a ford, a jump) is unreachable that way. With `?bot=1` the bot drives until a control is touched and then hands over for good, so a scene can be carried to a PLACE on the stage and do its one thing there.
