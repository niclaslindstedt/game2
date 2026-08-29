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

8. **Traffic** — handed the cars near it (`TrafficCar`: a position, a speed and a lateral offset, and nothing else), the bot moves its aim off the crown to go round the car in front, sits in behind it at its pace when there is nowhere to go, and — depending on its temper — leans on it going past. See the traffic model below. Handed nothing, it drives exactly the stage it always drove, which is what keeps `make sim` comparable across a change to this file.

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

## Traffic: what a bot does about other cars (`engine/sim/bot.ts`)

The corner plan drives a ROAD. Two more knobs decide how a bot drives a RACE, and they are deliberately **not** skill axes: neither is monotone in pace, and a crew who reaches the finish having put three cars in the trees is not a better driver than one who went round them. They are temperament, so they come off the crew (`rivals.ts`) rather than out of the difficulty's budget.

| Knob         | What it decides                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `overtake`   | How hard they go for the move: how close they run alongside, how long they sit in somebody's dust |
| `aggression` | What they are prepared to DO to the car once they are there                                       |

`aggression` runs 0..1 across two thresholds, and the behaviour either side of each is different in kind rather than in degree:

- **Under `AGGRO.clean` (0.35)** — no contact is ever made on purpose. The bot aims a car's width of air outside whatever it is passing, and when the road will not take the move it sits in behind at the other car's pace instead of driving into the back of it.
- **`AGGRO.clean` to `AGGRO.dirty` (0.35–0.75)** — the air comes out of the gap and the aim eats into the bodywork, which is a target only the contact model can stop. That is what leaning on somebody is: a shove sideways while the two are alongside, hardest where the verge on their far side is nearest, because there is nothing to be won leaning on a car in the middle of a wide road and everything to be won doing it where the trees start.
- **Over `AGGRO.dirty` (0.75)** — the bot is not passing cars any more, it is removing them. It will take the hit at the **rear quarter** as well as alongside: the contact model turns a sideways impulse into yaw by how far ahead of the struck car's centre it lands (see [architecture.md](architecture.md) and `engine/game/collision.ts`), so a shove behind another car's centre puts it round rather than merely sideways. It costs the attacker the pass it was halfway through, which is why only the nastiest crews think it is worth doing.

Two rules hold at every temper. The move always goes down **the side the bot is already on** — a pass that starts by crossing the car it is passing is a shunt, not a move, and the bot only comes back across from behind and only when its own side has run out of road. And the aim never leaves the road: the offset is clamped to the carriageway with a half body to spare, so a bot cannot avoid or attack anybody by driving onto the verge.

## The campaign field (`engine/sim/rivals.ts`)

R29 — the campaign is raced against **fourteen crews**, and the player is the fifteenth and last car out, `START_INTERVAL` seconds behind the one in front. Each crew is data: an alias, a car, a `standing` (where they sit in the field's budget band) and a set of weights (how they spend what they are given), plus notes describing what they are good at and what lets them down. The shape is fixed and the budget is not, so the field keeps its characters at every difficulty: Blink is always the one with the hands and no eyes, Metronome always the one who never makes a mistake and never makes a move.

Points buy more than a profile: a crew whose `hands` reach `MANUAL_HANDS` (5.5 of 10) drives the **manual box**, with the taller ratios and the top end that come with it (see [driving.md](driving.md)). Nobody on easy has the hands for it, two crews do on medium, and six of the fourteen do on hard — so the head of a hard field is quicker than its plan alone says, and the box is a character (Blink and Metronome, the two who bought hands) before it is a rank.

Each crew also has a **temper** and an **overtake** number — what they are like once there is somebody else's bodywork in the way. `overtake` is the crew's own at every setting; `temper` is a place in the field's pecking order (0 for the mildest driver on the roster, 1 for the one with the reputation) which the difficulty's band turns into an actual `aggression` (`temperFor`). Scrapper is the one to watch on easy as well as on hard; what changes is what she is allowed to do about it.

A difficulty is one number — the points the middle of the field gets — plus a spread, and a band of temper beside it:

| Setting  | Budget | Spread | Temper band | P3 pace, as a ratio to `RALLY_BOT`            |
| -------- | ------ | ------ | ----------- | --------------------------------------------- |
| `easy`   | 11     | ±7.5   | 0 – 0.50    | ≈ 1.22 (the podium is 22% off reference pace) |
| `medium` | 19     | ±8.5   | 0.10 – 0.72 | ≈ 1.08                                        |
| `hard`   | 28     | ±8     | 0.25 – 1.00 | ≈ 0.97                                        |

The bands overlap: the quickest EASY crew is about as good as the slowest MEDIUM one, which is what makes stepping up a difficulty feel like the field closing in rather than a different game.

The temper band is what each setting PROMISES against the thresholds above. EASY tops out just past `AGGRO.clean`, so the field gives way and the worst of it is a nudge from the two or three crews with a temper — nobody on it is trying to end anyone's run. MEDIUM tops out just under `AGGRO.dirty`: half the field will lean on you and none of it will put you in a tree on purpose. HARD reaches the top of the scale, and its floor is high enough that even the mild crews hold their line; it is the only setting where the rear quarter gets used.

Each crew is also PAINTED to fit: `RIVAL_SCHEMES` in `pwa/src/game/car-livery.ts` gives every one of them a palette nobody else in the field has and a pattern that says something about how they drive — Sideways wears the drifter's crescent in purple and acid green, Granite is cut stone blocked front and rear, Old Snow runs maroon and gold coachlines. `make field` renders the start list. Each crew is also a PERSON: `pwa/src/game/car-crew.ts` gives every one of them a caricature behind the wheel — Granite is built like the corner she refuses to rotate for, Skarv has the cormorant's neck, Old Snow wears a flat cap — in their own gear colours, with a map reader beside them in the same overalls. `make crew` renders them.

**The rivals are not a table of times.** The app builds fourteen more `GameState`s on the same compiled track and steps them beside the player's, so the field cannot drift away from the handling — it IS the handling. See `pwa/src/game/standings.ts`.

**They leave staggered, and they are really out there.** Each crew is entered owing `(PLAYER_NUMBER - 1 - number) × START_INTERVAL` seconds of head start, paid off in budgeted slices while the establishing shot runs; car 14 owes nothing and leaves as the shot opens, which is the car the player watches go. The whole field is entered on one staging slot `GRID_STAGGER` metres to the player's right (`createGame`'s `gridOffset`), so the crew in front pulls away from ALONGSIDE the player rather than out from inside them. A crew still owing is still in the start control: not drawn, and not something the world can touch. On a short stage the front of the field is home before the player's lights go out, which is what a ten-second interval over a two-minute stage actually looks like.

**Everybody is a disruption.** Contacts are resolved between the player and each rival on the road, and between the rivals themselves (`collideCars`, both ledgers written at once). Catch the crew in front and you can lean on them out of a corner — or put them into the trees, and their time with them; and they can do the same to each other, and to you.

The field sees itself, too: `stepField` hands every crew the cars around it — the player included — so a queue on the road is a race rather than fourteen games driving through one another. Rival-against-rival contact happens **only in `stepField`**, which is the one place the whole field takes the same tick. `catchUpField` and `settleField` drive each run independently, so a crew being fast-forwarded through its head start is at a different moment of the stage than the one beside it in the array, and a shunt between those two would be between cars that were never on the road together.

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

`simulateStage({ seed, carId, gearbox, profile, length, shape, laps, maxTime })` runs a full stage (at a finite stage length band — default medium) and returns: finish state and time, the laps raced and each lap's time, one lap of road (`trackLength`) and the ground the race actually covered (`raceLength`), the whole event log, the run stats (drift count/time/score, jumps, air time, clean landings, splashes, off-road time, impacts, crashes, respawns, top speed), what the run cost the car (`crush`, metres of folded panel, and `wear`, 0..1 structural), and a **digest** — an FNV hash over sampled positions. Runs are deterministic: same seed + car + profile ⇒ same digest, which is exactly what `tests/simulation_test.ts` asserts. `shape: "circuit"` races a closed lap over three of them (R22); a sprint is one lap of a road that never comes back, and asking for more laps of one does nothing.

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
make heat                             # the HEAT table: the whole grid at once (see below)
npm run sim -- --heat --grid 6        # …on a shallower grid
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

## Run tapes: a human drive, measured (`engine/sim/tape.ts`, `race.ts`)

The tables above are bots measuring bots. That is the right measurement for handling and for the generator, and the wrong one for a DIFFICULTY: a difficulty is a promise made to a person, and a bot lap only ever says what the bot would do. A **run tape** closes that gap — one whole run written down as the controls that drove it, in a JSONL file that replays exactly.

Recording one:

- **In the game.** Developer menu → **COLLECT RACE DATA**, drive, then **SAVE RUN DATA** on the results card. (`?record=1` forces the switch on for a scripted pass, which is how `scripts/` collects one without anybody finding the menu.)
- **Headlessly.** `make record SEED=42 CAR=compact DIFFICULTY=hard` drives the bot and writes the same file — a reference lap in one command.

Reading one back:

```sh
make replay RUN=runs/my-run.jsonl DIFFICULTY=easy,medium,hard
npm run tape -- replay runs/my-run.jsonl --splits   # where the time went
npm run tape -- show runs/my-run.jsonl              # the header and the field, no replay
```

The file is one JSON object per line: a `run` header (stage, car, field, start), `in` lines each holding until the next one (so a pedal buried down a straight is one line and not nine hundred), a `skip` line where the driver cut the establishing shot, a `sample` a second, and a `result` plus one `rival` line per crew. Being JSONL means `grep`, `jq` and a diff all work on it, and a line can be edited by hand to ask "what if I had lifted here".

The replay prints two things, and they are different questions:

- **Reproduced.** The tape put back into the run it came out of, and the **drift** — how far the replayed car ended up from where the recording says it was, at the worst sample. Zero means this build still drives the tape the way it was driven. Anything else means the handling has moved underneath the recording, and nothing below it can be trusted. (This makes a tape a regression test for FEEL: keep one, and any change that moves the car reports itself in metres.)
- **Placed.** The time, slotted into each field in turn — the calibration. `to win` and `podium` are the gaps to the quickest crew and to the third-place cut, which is the one that decides whether a campaign stage opens the next.

**The field is raced with nobody on the road with it, and the drive is not re-driven against it.** That is deliberate and it is the only honest way round. A tape is a BLIND driver: it steers where it steered, so a car that was not there when it was recorded is a car it drives into and never corrects for — and worse, a shunt that DID happen was steered out of on the recording, so replaying those corrections without it swerves. A rally start puts the crew in front alongside the player, so this bites within two seconds. Racing the crews alone has none of that in it, and it is still an exact question with an exact answer: the field is deterministic in its seed, its difficulty and its size, so "what would this time have been worth against a hard field driving its own race" has one answer and always the same one.

What it is NOT, since the crews began to see and to touch each other, is a claim about the race the tape was recorded in. A rival's time now depends on the cars around it — including the player's, who can lean on one crew and set off a shunt three cars down the road. That is the point of a race, and it is why the calibration is quoted against the field's own clean race rather than against a re-run of yours.

**The workflow rule: any change to `skill.ts` or `rivals.ts` owes a replay of the same tape before and after**, beside the `--field` table. The table says what the budgets bought; the tape says what that did to a person.

## The heat table (`make heat`, `--heat`)

Every other table on this page drives a car **alone**, which is the honest instrument for handling and for the generator — a lone car's time is the road and the physics and nothing else. It is a blind instrument for the half of the field model that only exists when there is somebody in the way: the bot's traffic eyes and the crews' tempers never fire in a lone run, so no amount of `make sim` can say what a difficulty's MANNERS are worth.

`simulateHeat` (`engine/sim/heat.ts`) is that instrument. It stands the real field on a real mass-start grid, steps every car together through `stepField`, and reports what they did to each other as well as what they did to the clock. Three columns carry it:

| Column            | What it says                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `rubs`            | Contacts with another car. A run of touching steps inside `RUB_GRACE` (half a second) is ONE racing incident   |
| `drove in`        | How many of those this crew was the one closing on the other — read before the impulse rewrote both velocities |
| `dealt` / `taken` | Metres of folded panel, counting only the contacts this crew drove into                                        |

The attribution is the whole point of the last two. Two equal cars in a shunt fold about the same amount each, so an unattributed damage column would say nothing more than "was in a crash"; booking the panel to whoever drove in is what separates a crew who leans on the field from one the field leans on. A contact neither of them drove into — two cars shoved together by the road — is nobody's to answer for and counts as a rub and nothing else.

Read the per-difficulty header first: contacts per heat, panel per heat, retirements. A heat with no contacts at all is eight cars driving a stage in convoy rather than racing it; a difficulty where nobody deals any panel is a difficulty whose manners do not exist.

**Any change to the traffic model in `bot.ts`, to the temper bands in `skill.ts`, or to a crew's `temper` in `rivals.ts` owes this table.** The unit tests pin the mechanism (a temper makes contact; a difficulty sets the temper) and deliberately not the emergent totals — a handful of shunts over a whole grid is one accident's worth of noise, which is a flake rather than a guard.

## What the tests pin down

`tests/simulation_test.ts` encodes the contract between generator and handling:

- bots finish every sweep stage with either car, with at most one recovery;
- stage pace stays in rally territory;
- stages with hard corners get drifted, stages with jumps get flown;
- identical runs produce identical digests; different cars produce different runs.

`tests/tape_test.ts` pins the run tape: every control round-trips through the file, a recorded run replays onto the same metre of road (with a field beside it and without), a time placed against a field alone agrees with the place that run actually scored, and the same lap is never worth a better place against a better field.

`tests/traffic_test.ts` pins the other car: the contact model itself, the bot's traffic eyes (a clean crew passes without touching, a temper closes the gap, and neither ever crosses through the car it is passing), that a stage handed no traffic is driven exactly as it always was, and that a headless heat is deterministic and books its contacts once each. `tests/rivals_test.ts` pins the temper ladder — that a crew keeps its rank in the field's pecking order at every setting, and that easy still has somebody on it who will lean on you.

If a tuning change breaks one of these, the change is wrong or the test's world just moved — decide which explicitly, never silently.

## Screenshots close the loop

Numbers say whether the game is _sound_; pictures say whether it _looks and reads_ right. `make screenshots` (scripts/screenshot.mjs) serves the built app, drives it with scripted keyboard input, and captures the grid, full speed, a drift, the first jump reached, the sealed-road trio, every camera angle (plus the distant three mid-turn, where their sway shows), the lap clock mid-circuit, the results card, and portrait framing into `previews/`. Pass scene-name fragments on the command line to shoot only those. Iterate: change → `make sim` → `make screenshots` → look.

Two habits keep a scene pointed at what it is for rather than at the harness:

- **Drive by the run's clock, not the wall clock.** Under software rendering the engine advances at a fraction of real time, so a `waitForTimeout` lands somewhere different on the stage on every machine. The scene helpers read the HUD instead — the timer, the speed, and whether the co-driver has a call up at all (an empty strip is open road, a call going up is the turn-in) — so "out on the sealed road", "on open road", "stopped" and "at the turn-in" mean what they say.
- **A circuit is how a scene reaches a lap board.** `?shape=circuit&laps=2` (with `?bot=1` driving) puts a run past its own start line inside a screenshot's patience, which is the only way to photograph the lap clock or a results card with laps on it.
- **`?bot=1` rides out, the script takes the wheel.** Blind key presses only ever reach the first corner, and anything the generator places further in (a sealed section, a ford, a jump) is unreachable that way. With `?bot=1` the bot drives until a control is touched and then hands over for good, so a scene can be carried to a PLACE on the stage and do its one thing there.
