# Simulation and bots

Handling and generator changes in this repo are **measured**, not eyeballed. The measuring stick is a headless simulation harness that drives the real engine — `createGame`, `step`, the same functions the browser calls — with a bot at the wheel and no renderer attached.

## The bot (`engine/sim/bot.ts`)

A deterministic player stand-in that reads the same `GameState` the HUD reads and produces the same `CarInput` a thumb produces — it must never reach into physics internals. Its brain, in order:

1. **Aim** — a lookahead point on the centerline, speed-scaled; steering is proportional to the angle error.
2. **Corner-speed plan** — scans the curvature ahead; each corner caps speed at `√(a_lat/κ)`, distance-discounted by braking capability. `a_lat` is a FRACTION of the car's own lateral grip (`latFraction × gripAccel`), not a fixed number, so the same brain plans honestly in any car — and because the slide comes in relative to that same ceiling, this one knob is what decides whether the bot ever drifts a corner or only ever flicks the handbrake at one. It is scaled by the grip the car will actually HAVE at that corner: the surface AHEAD times the rubber this car is on, exactly as `car.ts` reads it. Without that the plan is blind to the whole surface half of a car's character, and no tire in the catalog ever shows up as pace. Hard corners are planned HOT — rally style, the drift scrubs the excess — by `hotEntry` m/s scaled by how freely the car rotates (`driftYaw` against the profile's `rotationRef`): the slide is what brings the nose round in there, so a car that rotates can carry more in than one that pushes.
3. **The flick** — arriving hot at a hard corner pulls the handbrake once, unsticking the rear. So bots drift hairpins the way players do, and drift regressions show up in bot stats.
4. **Drift management** — power through the slide, breathe when the angle gets deep, and steer where the car is GOING rather than where its nose is pointing: sideways, holding the nose on the lookahead puts the velocity off the road by exactly the slip angle, so the aim error is measured against the direction of travel. Counter-steer damps the rotation only once the nose is nearly where it should be (damping earlier is what runs a drift wide).
5. **Recovery** — out in the wild: cruise back toward the road at a pace the nature surface can steer at, and fire the reset input when the excursion is hopeless (out too long), like a player would.
6. **Backing out** — pinned against something with the throttle buried for `reverseAfter`, the bot stops pushing and reverses off it, wheel straight, until the car is properly moving (`reverseSpeed`); then it takes another run at the line. Being WEDGED is no longer a reason to reset: a driver backs off the trunk first, and the respawn is what happens when that fails too. The manoeuvre latches on the car's own `reversing` state so a single wedged tick cannot flicker it, and reversing counts as asking to move (`stepStuck`), so a car pinned both ways still reaches the engine's wedge rescue on time instead of braking forever.
7. **Gears** — reads `car.gearbox` (the run's box, not the car's) and shifts a manual by the same thresholds the auto box uses, so both simulate fairly. The box's own ratios are already in `state.spec` (`gearedSpec`), so a crew on a manual plans and shifts around the taller gears without the bot knowing there is a box.

Two of the knobs are estimates the driver makes rather than reflexes: `brakeUse` is how much of the car's braking the corner plan assumes it will get (a driver who trusts the brakes stays on the throttle later), and `offRoadGiveUp` is how long an excursion runs before the bot accepts the reset instead of ploughing on.

Bot profiles are data (`BotProfile`); `RALLY_BOT` is the default and the profile every table in this document is measured with. Slower/faster brains are new profiles, not code forks — and they are not hand-written either: see the skill model below.

## The skill model (`engine/sim/skill.ts`)

A `BotProfile` is ten numbers, and nothing about them says which of two profiles is the better crew. The skill model puts a BUDGET in front of them so that it does.

Skill is spent on six **axes**, each worth up to `AXIS_MAX` (10) points, and each axis moves one or two profile numbers from what a novice does to what the best crew in the game does:

| Axis         | What it buys                                                    | Knobs                                           | Authority |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------- | --------- |
| `commitment` | How much of the car's grip they lean on                         | `latFraction`                                   | ±20%      |
| `attack`     | How hot they arrive, and how much road is worth a flick         | `hotEntry`, `hardCurvature`                     | ±15%      |
| `vision`     | How far through the corner they are already looking             | `lookahead`                                     | ±15%      |
| `hands`      | How much authority the wheel has                                | `steerGain`                                     | ±10%      |
| `nerve`      | How far over their own plan they run before touching the brakes | `brakeMargin`, `brakeUse`                       | ±14%      |
| `recovery`   | What a mistake COSTS once it has happened                       | `reverseAfter`, `reverseSpeed`, `offRoadGiveUp` | —         |

**Every axis is monotone in pace** — more points is a quicker driver, never a slower one — and that is a measurement rather than an assumption: each range was swept one knob at a time against `RALLY_BOT` over four campaign stages and all three cars before it was written down, and the authority column is what that sweep found. An axis whose knob turned out to do nothing (`planHorizon`, which is flat above about a second of horizon) is not an axis. `recovery` has no pace authority at all on a clean run and whole minutes of it on a bad one, which is exactly what it is for.

`spend(budget, weights)` distributes a budget in the proportions a crew asks for, **water-filling**: an axis that fills up keeps its cap and hands its share back to the pot, so a crew that wanted everything in one place still ends up with a complete car. That is what makes a lopsided character a SHAPE at low budgets and merely a lean at high ones.

`RALLY_BOT` is worth about 38 of the 60 points on this scale.

## The campaign field (`engine/sim/rivals.ts`)

R29 — the campaign is raced against **fourteen crews**, and the player is the fifteenth and last car out, `START_INTERVAL` seconds behind the one in front. Each crew is data: an alias, a car, a `standing` (where they sit in the field's budget band) and a set of weights (how they spend what they are given), plus notes describing what they are good at and what lets them down. The shape is fixed and the budget is not, so the field keeps its characters at every difficulty: Blink is always the one with the hands and no eyes, Metronome always the one who never makes a mistake and never makes a move.

Points buy more than a profile: a crew whose `hands` reach `MANUAL_HANDS` (5.5 of 10) drives the **manual box**, with the taller ratios and the top end that come with it (see [driving.md](driving.md)). Nobody on easy has the hands for it, two crews do on medium, and six of the fourteen do on hard — so the head of a hard field is quicker than its plan alone says, and the box is a character (Blink and Metronome, the two who bought hands) before it is a rank.

A difficulty is one number — the points the middle of the field gets — plus a spread:

| Setting  | Budget | Spread | P3 pace, as a ratio to `RALLY_BOT`            |
| -------- | ------ | ------ | --------------------------------------------- |
| `easy`   | 11     | ±7.5   | ≈ 1.22 (the podium is 22% off reference pace) |
| `medium` | 19     | ±8.5   | ≈ 1.08                                        |
| `hard`   | 28     | ±8     | ≈ 0.97                                        |

The bands overlap: the quickest EASY crew is about as good as the slowest MEDIUM one, which is what makes stepping up a difficulty feel like the field closing in rather than a different game.

Each crew is also PAINTED to fit: `RIVAL_SCHEMES` in `pwa/src/game/car-livery.ts` gives every one of them a palette nobody else in the field has and a pattern that says something about how they drive — Sideways wears the drifter's crescent in purple and acid green, Granite is cut stone blocked front and rear, Old Snow runs maroon and gold coachlines. `make field` renders the start list. Each crew is also a PERSON: `pwa/src/game/car-crew.ts` gives every one of them a caricature behind the wheel — Granite is built like the corner she refuses to rotate for, Skarv has the cormorant's neck, Old Snow wears a flat cap — in their own gear colours, with a map reader beside them in the same overalls. `make crew` renders them.

**The rivals are not a table of times.** The app builds fourteen more `GameState`s on the same compiled track and steps them beside the player's, so the field cannot drift away from the handling — it IS the handling. See `pwa/src/game/standings.ts`.

**They leave staggered, and they are really out there.** Each crew is entered owing `(PLAYER_NUMBER - 1 - number) × START_INTERVAL` seconds of head start, paid off in budgeted slices while the establishing shot runs; car 14 owes nothing and leaves as the shot opens, which is the car the player watches go. The whole field is entered on one staging slot `GRID_STAGGER` metres to the player's right (`createGame`'s `gridOffset`), so the crew in front pulls away from ALONGSIDE the player rather than out from inside them. A crew still owing is still in the start control: not drawn, and not something the world can touch. On a short stage the front of the field is home before the player's lights go out, which is what a ten-second interval over a two-minute stage actually looks like.

**The player is the only disruption.** Contacts are resolved between the player and each rival on the road (`collideCars`) and never between two rivals: a rival's time has to mean a stage they drove alone, and a result decided by a shunt the player never saw is not one they can read. Catch the crew in front and you can lean on them out of a corner — or put them into the trees, and their time with them.

## The mass-start grid (`engine/sim/grid.ts`)

HEADS UP races the same crews, the same bot and the same roads with the championship taken off — and, optionally, with the rally start taken off too. A **mass start** puts the whole field on one grid and sends it on one green, which changes four things and nothing else.

**The grid stands behind the start gate.** R24 already lays `STAGE_RULES.startZone.apron` metres of flat dirt road off the back of the first sample — the rally start's run-up, straight, with the terrain shelf held flat under it — and that is where the field goes. Every car is on the road, none of them is off the stage (`pastApron`), and the whole grid drives THROUGH the gate when the lights go green. The apron's length is therefore a hard ceiling on how deep a grid can be, and `GRID_MAX` is derived from it rather than chosen: lengthen the apron in the rule book and the grid grows with it.

**It zig-zags.** One car per row, alternating sides of the centre at `columnOffset`, `rowGap` metres between rows — the way a kart or club grid is actually laid out. The gap is a little under a car's length, so the cars overlap nose to tail and are kept apart across the road instead; that is what a stagger IS, and from the back of it the field reads as a queue running away up the road rather than as rows of pairs.

**The entry list is shorter, and it is a spread.** `entryList(cars)` picks `cars - 1` crews spread evenly across the roster's reputation order rather than skimmed off the top of it. The best seven crews are one tier of driving seven times over, with nothing to pass; a spread keeps Sprat at the tail, Frostbite at the head, and the characters in between as far apart as a short list allows. How hard the whole field is stays the difficulty's job.

**The order is inverted.** `headsUpField` puts the SLOWEST crew on pole and the quickest one on the row in front of the player, who is last. Seed it the rally way — reputation first — and the fast crews drive away from a field that was never going to catch them, and the race is over before the first corner. This way the road ahead is a queue that has to be worked through, by the good bots as much as by the player.

### The catch-up, and why it is not `deficit / s`

A row back is metres given away, and the player is on the back row, so the metres come back as **the only catch-up in the game**: a slot's drive is multiplied by `1 + gain` until it reaches `catchUpS` (200 m) along the stage, and the ledger is torn up the moment it is spent — a circuit's second lap does not launch the field again.

The size of that gain is arithmetic, corrected by measurement. Two cars accelerating at `a` and `a(1+k)` off the same standstill are apart by `½akt²`; the leader covers `s` in `t = √(2s/a)`, so by then the trailing car has taken back `½ak(2s/a) = k·s` metres — independent of `a`, of the car and of the surface. That would make `k = deficit / s`. It does not hold, because `a` is not constant: `engineAccel` tapers to nothing at each gear's top, so most of a 200 m window is spent where a percent more drive buys well under a percent more road. Measured against the real physics — two identical cars flat out on a straight, one boosted, the gap read where the leader reaches the window's end:

| Window | compact | classic | coupe |
| ------ | ------- | ------- | ----- |
| 80 m   | 0.75    | 0.67    | 0.90  |
| 120 m  | 0.65    | 0.68    | 0.82  |
| 200 m  | 0.65    | 0.52    | 0.80  |
| 300 m  | 0.51    | 0.49    | 0.76  |

The yield is flat in `k` (the model is linear in it) and falls with the window, which is the taper. `catchUpYield` is that number for the window in use, so `gain = deficit / (catchUpS × catchUpYield)`, capped at `catchUpMax`. On the default eight-car grid the back row is 24.5 m down and gets about 19% more drive for the first two hundred metres, decaying a row at a time to nothing at the front.

It is deliberately the only assistance: no rubber band, no slipstream, no hand on the leader's brake. It reads the grid and never the running order, and it is over before the first real corner of any stage. **`tests/mass_start_test.ts` measures what actually comes back**, so a handling change that moves the torque taper fails there rather than quietly making the back row a worse place to start.

**Everything else is shared.** The same `RivalField`, the same classification, the same solid cars on the road. What differs is that nobody is owed a head start — the grid sits through the same establishing shot and the same lights the player does — so a place read mid-stage is the actual order of the road rather than a count of better split times.

## The harness (`engine/sim/simulate.ts`)

`simulateStage({ seed, carId, gearbox, profile, length, shape, laps, maxTime })` runs a full stage (at a finite stage length band — default medium) and returns: finish state and time, the laps raced and each lap's time, one lap of road (`trackLength`) and the ground the race actually covered (`raceLength`), the whole event log, the run stats (drift count/time/score, jumps, air time, clean landings, splashes, off-road time, impacts, crashes, respawns, top speed), and a **digest** — an FNV hash over sampled positions. Runs are deterministic: same seed + car + profile ⇒ same digest, which is exactly what `tests/simulation_test.ts` asserts. `shape: "circuit"` races a closed lap over three of them (R22); a sprint is one lap of a road that never comes back, and asking for more laps of one does nothing.

## The CLI

```sh
make sim                              # seeds 1..8, every car, the balance table
npm run sim -- --seeds 42,99          # specific seeds
npm run sim -- --car classic          # one car
npm run sim -- --count 20             # a wider sweep
npm run sim -- --length long          # stage length band (default medium)
npm run sim -- --shape circuit        # race a closed lap circuit (R22)
npm run sim -- --shape circuit --laps 5
npm run sim -- --weather storm        # race in rain/storm wind
npm run sim -- --gearbox manual       # drive the bot with a manual box
npm run sim -- --asphalt 0.8          # the generator's dials, each 0..1:
                                      # --elevation --water --trees --asphalt
npm run sim -- --sweep                # the ROSTER BALANCE table (see below)
npm run sim -- --field                # the CAMPAIGN FIELD table (see below)
npm run sim -- --json report.json     # machine-readable dump
```

The dials change what the stage IS, so they change the table: tarmac buys pace and costs drift time (that is what it is FOR), water and hills cost both. Sweep one at a time — a dial moved with a handling change makes the diff unreadable.

The table columns: the ground covered (one RACED lap × the laps on a circuit — the road up to the finish line, never R25's run-out past it), time, average pace, drifts / drift time / drift score, jumps / air time, fords, off-road time, hits (damaging impacts — trees, boulders, slammed landings), respawns (crash respawns and bot resets both land here — and both now cost the road back to the last checkpoint, R28, so this column is time as well as a count), top speed, finished. The footer aggregates. **The workflow rule: run it before and after every handling or generator change and paste both tables in the PR.** Exit code is non-zero if any run failed to finish, so CI's `simulate` job doubles as a smoke alarm.

## The roster balance table (`--sweep`)

The default table races one set of dials over one pool of seeds, so it ranks
the cars exactly once — and one car being fastest on every stage in the game
is invisible to it. `--sweep` races the whole roster over five stage
ARCHETYPES and ranks them per archetype, with a loud warning if a single car
takes all five.

An archetype is two things. The generator's dials say what the road is
surfaced and shaped like; the SEED says how twisty it is, and no dial moves
that — so an archetype asking for `tight` or `flowing` stages measures the
whole seed pool's mean curvature and races only the matching end of it.
Nothing here is a special stage type: the generator builds all of them from
the same rules.

The five: `tarmac` (fully sealed, flowing), `mountain` (a sealed pass, steep),
`mixed` (half and half), `wet` (loose and forded), `gravel` (loose, dry,
flat). A healthy roster has every car winning at least one, the specialists
winning their home ground by more than the all-rounder wins the middle, and
nobody worst everywhere. **Any change to `cars.ts` owes this table.**

## The campaign field table (`--field`)

The tuning loop for the rival difficulties. It drives every crew at every setting through the real engine and prints what the budgets in `skill.ts` actually buy — three seeds by default, because fourteen crews at three settings is already 126 runs and a fourth seed buys less than it costs (`--seeds` overrides).

Everything is quoted as a **ratio to `RALLY_BOT`** on the same seed and car, because that profile is the reference every other table here is measured with and the one number that does not move when a stage changes length. Read the **P3** column: it is the podium, and the podium is what a difficulty IS. Above 1.00 the field is slower than the reference bot, so a reference-pace run wins the podium; below it, it does not.

The per-crew line under each difficulty is the field in finishing order with each crew's points and mean ratio, and a `!` on anybody who failed to finish. That line is how a character is checked: if two crews on the same points are never in a different order on a different stage, one of them is not actually a different driver.

**Any change to `skill.ts` or `rivals.ts` owes this table.**

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

- **Drive by the run's clock, not the wall clock.** Under software rendering the engine advances at a fraction of real time, so a `waitForTimeout` lands somewhere different on the stage on every machine. The scene helpers read the HUD instead — the timer, the speed, and whether the co-driver has a call up at all (an empty strip is open road, a call going up is the turn-in) — so "out on the sealed road", "on open road", "stopped" and "at the turn-in" mean what they say.
- **A circuit is how a scene reaches a lap board.** `?shape=circuit&laps=2` (with `?bot=1` driving) puts a run past its own start line inside a screenshot's patience, which is the only way to photograph the lap clock or a results card with laps on it.
- **`?bot=1` rides out, the script takes the wheel.** Blind key presses only ever reach the first corner, and anything the generator places further in (a sealed section, a ford, a jump) is unreachable that way. With `?bot=1` the bot drives until a control is touched and then hands over for good, so a scene can be carried to a PLACE on the stage and do its one thing there.
