# The track generator

Stages are built by a rules engine (`engine/mapgen/`), not authored by hand. The design splits into three files with three jobs:

- **`rules.ts` — the rule book.** Every constraint and every vocabulary number lives here as data: what a soft, medium, or hard turn may be, how long straights run, where jumps, crossings, and crests may sit, the length bands and their world bounds, the self-distance floor, the five dials (below). Tuning the generator means editing this file.
- **`search.ts` — the machinery every search shares.** The walking cursor, the spatially hashed point field that answers R9 and R10, the draws that turn the vocabulary into a candidate segment, and the feature assignment that decides what a straight carries. What differs between the three searches is only where the line is being steered.
- **`generate.ts` — the search.** Draws candidate segments from the seeded RNG, validates each against the rules, retries a bounded number of times, backtracks when boxed in, and rejects a whole attempt (retrying with a derived sub-seed) rather than ever shipping a violation. `generateStage(seed, length, knobs, shape)` is a pure function of its inputs. `createStageStream(seed)` is the endless variant: the same vocabulary, streamed forever.
- **`circuit.ts` — the closed lap (R22).** The same vocabulary steered around a RING — a bearing that turns once through a full circle over the target lap — and then CLOSED onto the grid's own pose by a solved turn-straight-turn. See [The circuit](#the-circuit).
- **`road.ts` — the cross-section.** What a road looks like ACROSS its width: the camber, the corner's bank, the two worn wheel tracks, the asphalt mat standing proud of the ground, the shoulder falling away into the field. One module read by three consumers — the renderer builds the ribbon from it, the terrain field hangs its verge off it, and the physics rides it — so the shape the car climbs out of is exactly the shape the player sees.
- **`land.ts` — the bare country.** The landscape before anybody laid a road across it: rises, hills, mountain chains, and the basins that fill to lakes. The terrain field shapes itself around the road from it, and the branch builder steers by it — a road has to know where the water is before it drives into it.
- **`spurs.ts` / `guards.ts` / `river.ts` — the country around the route.** The abandoned branches at every junction, the mounds and groves that shut the inside of a sharp corner, and the watercourses the road crosses.
- **`compile.ts` — the geometry.** Turns the segment plan into evenly spaced samples (position, heading, elevation, surface, curvature, jump lips) plus the pacenote list the HUD calls from — the single geometric truth read by the physics, the renderer, and the bots alike. `compileStage(seed, length)` is the entry point; an endless track carries a `track.extend(upToS)` that materializes more road as the run progresses.

## The R-rules

The generator respects rally reality. Verbatim from the rule book, each enforced in the search (or realized in the compiler) and asserted across seeds in `tests/mapgen_test.ts`:

- **R1** A stage opens with a straight — a start grid plus room to build speed.
- **R2** A finite stage closes with a straight — a visible finish, no blind final turn. (An endless stage never closes.)
- **R3** Turns come in three severities with distinct radius/angle vocabularies: soft (fast, open), medium (a real corner), and hard (slow, tight — up to hairpin).
- **R4** A hard turn only follows a straight: there is always a braking zone.
- **R5** At most two consecutive same-direction turns — no endless spirals — and a same-direction run never curls past the angle cap (a near-loop the self-distance probe would only reject after building the doomed geometry).
- **R6** Jumps sit on straights, with a clear run-up before the lip and a landing zone after it; jumps keep a minimum spacing between lips.
- **R7** Water (a ford) sits on straights only, never in the landing zone of a jump, and never on the opening or closing straight.
- **R8** Crests (blind brows) sit on straights and never combine with a jump or a ford on the same segment.
- **R9** A finite stage's centerline stays inside its length's world bounds; when the stage nears the boundary the generator must turn back toward the middle. (An endless stage roams an unbounded world.)
- **R10** The centerline never crosses itself — non-adjacent parts of the stage keep a minimum distance between them (measured per candidate point beyond an 80 m route-neighbour window, so hairpins stay legal and folds stay impossible). The distance itself is R23's. On an endless stage the guarantee covers the trailing `endless.tailWindow` meters — road further back is long gone behind the car and out of sight.
- **R11** Total stage length lands inside the selected stage length's band.
- **R12** A ford sits in a dip: the road eases down to FLAT water and climbs back out. Water never stands on a rise — it collects at a local low point, fed by the stream that crosses the road there.
- **R13** A water crossing too wide to wade carries a BRIDGE instead of a ford: the road stays level across it, the water runs in a ravine below, and the deck is timber up to `bridge.timberMax` — past that only concrete spans it. Going over the side is a drowning, which is what a parapet is for — so a concrete deck's parapet is an unbroken run of SOLIDS down both edges, cast into the deck, immovable, and drawn exactly where the engine collides with it (`bridgeParapets`, the one statement of where the bays stand). It is the one wall on a stage that is there on purpose: R31 cuts every other one away. A timber deck's rail is posts and a rail, and a car goes through it. Every leg that carries a deck — the piers and both abutments — is founded on the GROUND under its own foot rather than on a nominal water level, or the bridge reads from the bank as one held up by nothing.
- **R14** The inside of a sharp corner is GUARDED: a turn (or a combination) that bends past `guard.angle` gets the ground between its entry and its exit filled with a steep mound or a dense grove. Neither is a wall — both can be taken — but both cost more than the corner does, which is the point: a corner whose inside is open grass is not a corner, it is a suggestion.
- **R15** Asphalt comes in RUNS, never a chequerboard: the stage alternates gravel and sealed sections hundreds of meters long, and the `asphalt` dial is the share of the stage that comes out paved.
- **R16** A road has a CROSS-SECTION, and it is CURVED across its width rather than flat: FIVE LINES run down it — a loose pale edge on each side that no wheel ever touches, two worn tracks a real car's track-width apart where every car before you put its wheels, and the crown between them, driven over but never grooved and so the highest line on the road. The tracks are troughs deep enough to feel and to see, which is what tells you from inside the car that the road has been used; the loose edges fade into the shoulder rather than stopping at it, so the surfacing meets the country instead of ending at a ruled line. Asphalt is laid ON the ground so its mat stands proud with chippings down the edge. Past the shoulder the ground simply leans away into the field. No ditch — a trench ruled down both sides reads as a scar cut by a machine, and it is a trap that swallows a car the moment it puts a wheel wide.
- **R17** A surface change is a JUNCTION, and a junction is a PLACE. It sits ON the route's centerline, at a corner tight enough that the two carriageways actually part (`paving.junctionParts`, measured in road widths) rather than peel apart over a slip road's worth of tangent. The sealed road is the MAIN road: it runs straight through, made of the route's own collinear arm on one side and the abandoned branch — the same road, the same width — on the other. The gravel road is the MINOR one, and it stops at the main road's edge, cut at that angle, with the smear of gravel every car turning out of it drags onto the seal. Inside the platform both carriageways are warped onto one graded plane: no camber, no bank, no wheel tracks, no borders, no markings. Where they part, the pavement is carried into the wedge between them so the gore starts as an island and not a knife edge. The abandoned branch is real road — it runs off the map (or to the shore of the lake that stopped it, never out across the water), and a player who ignores the tape can follow it.
- **R18** Water obeys nature: ONE watercourse per valley, born on the high ground above the highest crossing, visiting every place the road crosses it in descending order, gathering width as it goes, pooling flat where the ground dips, and ending in the lowest water it can find. Two crossings the land refuses to join — a ridge between them — are on different water. And it meets the road at its crossings and nowhere else: between two of them the course keeps its bank clear of the corridor, because there are no culverts here — water routed under a road it does not cross carves the ground out from under the ribbon and draws a sheet of water through it. A reach that cannot get around a road ends there, and the crossings past it are on their own water.
- **R19** Turns are BANKED. A road built through a corner is superelevated: the cross-fall rolls out of the crown and into the turn over a runoff, tops out at a rate read off the corner's radius, and rolls back out again. Never a wall of a bank — the ceiling is a road a car could be parked on, and gravel takes more of it than tarmac because a bladed corner always does.
- **R20** A JUMP never sits on sealed road. A tarmac section is a public road the rally borrows; nobody builds a launch ramp into one.
- **R21** The road's WIDTH is a dial, from a narrow lane the trees crowd to a broad boulevard with room to place the car.
- **R22** A stage is SHAPED as a sprint or as a CIRCUIT. A circuit's last sample lands back on its first, on the same heading, so the start line is also the finish line and the stage can be raced over laps. Everything else — the vocabulary, R3 through R8, the world bound, the features — is the sprint's; R10's self-distance is measured cyclically, because on a ring the road running back into the start line is that line's neighbour and not a crossing of it.
- **R23** No two pieces of road share ground. The terrain lays its shelf under ONE road (`terrain.ts` picks the nearest), so a second corridor over the same country is left hanging in the air with nothing under it and nothing to drive on — a wall of road you can see through and drive through. So the clearance is measured centerline to centerline and sized from the road's own width: both corridors' full reach plus `roadClear.margin` of bare country between them. It binds the route against itself (R10) and it binds the abandoned branches (R17), which turn away from the stage the way they turn away from a lake and stop where they cannot.
- **R24** The START is a PLACE, not a line. The grid, the APRON of dirt behind it — real road, with a terrain shelf under it and physics on it — and R23's clearance around both belong to the start: on a sprint the route may not come back into it, no branch may cross it, and the finish's run-out may not land in it. A road floating over the start is the first thing a run ever sees. A circuit is the exception the shape makes: it closes onto its own start line along the apron rather than across it (R22). Past the apron, at either end of a sprint, the stage is simply over and the terrain owns the ground.
- **R25** A SPRINT's finish line is not the end of its road. It carries on past the gate for a RUN-OUT (`runOut`, 220 m) — road the car coasts down after the clock has stopped, so the finish is a line drawn across a road rather than the cliff edge of a world that ran out of budget. The run-out is NOT part of the raced stage: R11's length band measures the road up to the line, and `track.finishS` is where that line is. Crossing it puts the run into its `rollout` phase, and the car is driven home from there (`TUNING.rollOut`) with the camera planted at the gate. A circuit needs none — its finish is its own start line, with a whole lap of road already the other side of it — so it finishes at the line the way it always has.
- **R26** KERBING goes where a driver needs it and nowhere else. See [the placement guide](#kerb-placement-r26) below.
- **R27** A stage is WATCHED. Spectators gather where a rally crowd actually gathers — at the finish, and at the corners worth standing at — on ground clear of the road, on the OUTSIDE of the bend where nothing leaving the road is coming at them. Driving past a stand at pace is heard (`cheer`).
- **R28** A stage is SPLIT INTO CHECKPOINTS, roughly a quarter-minute of driving apart, and every one of them stands just past the EXIT of a corner — the tighter the better. A checkpoint is both a split (where the run is measured against whoever it is racing) and the place a lost, drowned or crashed car is put back on the road, so it belongs where the road has just asked the driver a question rather than in the middle of a straight where it would cost nothing. See [checkpoint placement](#checkpoint-placement-r28) below.
- **R31** The road and the ground beside it are RIDEABLE. Within a BENCH of a road — the route's or an abandoned branch's — the landscape never stands above that road's own corridor, and past the bench it may only rise at a grade the car can climb (`verge.climb`). Whatever the country was doing there is CUT where it would otherwise be a wall a car sliding off the road stops dead against, or a hillside the ground lattice drags up through the tarmac. The bench is a LATTICE CELL DIAGONAL wide (`verge.bench`, against `GROUND_CELL`) because that is the reach of the triangles the ground is drawn and driven on: pin every corner that could sit over a road, and no triangle can cut up through one. It is a CEILING and nothing else — a valley, a ford's dip and the ravine under a bridge are all still exactly as deep as the landscape made them. R23 gains a height clause from it: a branch standing tens of metres above the stage needs the room for the stage's cone to climb to it, or the hillside that carried it there is gone and the branch is in the air.

## The dials

Five knobs (`STAGE_DIALS` in the pre-race menu, `StageKnobs` in the engine), each `0..1`, decide what KIND of stage a seed builds. They never break a rule: they move the ranges the rules draw from, and the middle of every dial is the stage this generator built before they existed.

| Dial        | 0                 | 1                                                                      |
| ----------- | ----------------- | ---------------------------------------------------------------------- |
| `elevation` | a plain           | mountain country — the road's own relief and the landscape's, together |
| `water`     | dry: the odd ford | lakeland: wide rivers, concrete bridges, water in the nature           |
| `trees`     | open heath        | closed forest (the SOLID trunk field the car crashes into)             |
| `asphalt`   | all gravel        | all sealed — the share of the stage that is tarmac (R15)               |
| `width`     | a narrow lane     | a broad boulevard with room to place the car sideways (R21)            |

They reach every entry point: `compileStage(seed, length, knobs)`, `createGame({ knobs })`, `simulateStage({ knobs })`, `npm run sim -- --asphalt 0.8`, `npm run track -- --width 0.1`, and the app's URL params (`?elevation=&water=&trees=&asphalt=&width=`). A track carries the dials it was built with (`track.knobs`), so the terrain field and the renderer shape themselves from the same set without being handed it separately.

## Stage lengths

The pre-race menu picks a length; each finite one maps to a band in `STAGE_RULES.stageLengths`, sized from the sim's measured bot pace so the minutes come out roughly true, with a world that grows with the band:

| Menu       | Target  | Band         |
| ---------- | ------- | ------------ |
| Short      | ~1 min  | 1.45–1.8 km  |
| Medium     | ~3 min  | 4.4–5.2 km   |
| Long       | ~5 min  | 7.4–8.4 km   |
| Extra long | ~7 min  | 10.4–11.8 km |
| Endless    | forever | streamed     |

A circuit is the same minutes of driving, cut into laps: its LAP band is the sprint band for that length divided by `STAGE_RULES.circuit.laps` (three), floored at `circuit.minLap` so a short circuit is a race track and not a roundabout. So a medium circuit is three laps of ~1.5–1.7 km, and it takes about the three minutes a medium sprint does.

| Menu       | Lap band     | Race (3 laps) |
| ---------- | ------------ | ------------- |
| Short      | 1.15–1.5 km  | 3.5–4.5 km    |
| Medium     | 1.47–1.73 km | 4.4–5.2 km    |
| Long       | 2.47–2.8 km  | 7.4–8.4 km    |
| Extra long | 3.47–3.93 km | 10.4–11.8 km  |

## The endless stage

`compileStage(seed, "endless")` builds the opening stretch and hands back a track that extends itself: the engine's `step()` keeps `STAGE_RULES.endless.horizon` meters of road materialized ahead of the car, and the renderer streams world chunks and terrain tiles in around it (and drops them behind). Two mechanisms replace the finite search's whole-attempt reject:

- **A course.** The stream is point-to-point: it follows a slowly drifting bearing and keeps the road's heading within an error budget of it, so an endless run reads as a journey rather than a scribble — and the walk never curls back into its own tail.
- **A commit lag.** The search runs `endless.commitLag` meters ahead of the road it hands out; inside that lag it may still backtrack out of a pocket. The freeze boundary follows the generation high-water mark, so what a seed produces is independent of how the extends are chunked — the same seed always streams the same road.

## The circuit

`compileStage(seed, length, knobs, "circuit")` builds a stage that comes back to where it started. The search is the sprint's, with one thing added at each end:

- **A ring course.** Instead of the finite search's turn-back-at-the-boundary, the line follows a bearing that turns once through a full circle over the target lap length (a ring of radius `lap / 2π`), and a drawn turn whose exit strays past the error budget is redrawn. That is what makes the line go ROUND rather than wander; the budget is wide enough that what comes out is a lap and not a roundabout.
- **A solved closure.** Wherever a closure could still land inside the lap band, the search tries to solve a turn-straight-turn (a Dubins CSC path) from where the road stands back onto the grid's own pose. Both corners are drawn from the turn vocabulary's own radii, and the sweep each one takes has to fall inside that severity's angle band (R3) — so a closing corner is a corner this generator would have drawn anyway. The straight between them is where a circuit gets its MAIN straight.

The solve is exact on ideal arcs, but the compiler walks an arc in 2 m steps and lands a little off the circle it was drawn from. So the closure is solved against the road AS BUILT: solve for a goal, walk what that produced the way the compiler will, move the goal by whatever the walk missed by, repeat. Headings need no such treatment (a segment's total turn is its curvature times its length however finely it is stepped), which leaves two numbers converging in a handful of passes. The result closes to within a few centimetres — well inside one sample, so the road runs into its own grid with no seam to see or drive over.

An attempt that boxes itself in is abandoned quickly and restarted on a derived sub-seed rather than unpicked at length: most of the cost is walking the same ground twice, so many short attempts beat a few long ones. A circuit compiles in the same handful of milliseconds a sprint does.

`track.circuit` says which shape a compiled stage is, and the run does the rest: `createGame({ shape, laps })` races a circuit over `STAGE_RULES.circuit.laps` by default, crossing the line books a `lap` event and sends progress back to the grid, and only the last crossing finishes.

## Pacenotes

The compiler emits one co-driver call per turn — contiguous same-direction turns merge into a single call — carrying direction, the tightest severity in the run, and the summed angle (`track.pacenotes`). The HUD reads them ahead of the car and shows the rally-style calls (EASY/MEDIUM/HARD LEFT/RIGHT, LONG past ~100°) — the corner being driven, plus the one after it drawn faint underneath when it lands inside the same lead; the engine's positive direction reads as a LEFT turn on screen (the rendered world mirrors the engine's map view — the same one-flip rule as steering).

## Checkpoint placement (R28)

The boards are placed in the compiler's own segment walk
(`engine/mapgen/compile.ts`), from `STAGE_RULES.checkpoint`:

| Knob           | What it decides                                                                        |
| -------------- | -------------------------------------------------------------------------------------- |
| `spacing`      | the target gap between boards, in SECONDS of driving — 15 s, because a split is a time |
| `pace`         | ...at this pace (m/s), the same measured bot pace the length bands are sized from      |
| `early` `late` | fractions of that gap at which the severity bar drops                                  |
| `runOut`       | how far past the corner's exit the board stands, capped by the road that carries it    |
| `finishClear`  | how much road before the finish gate no board may stand in                             |

A candidate is judged at the START of the segment AFTER a corner, because
only the next segment says whether the corner is over: a turn carrying
straight on in the same direction is one corner still happening, and a board
in the middle of a combination marks nothing. That makes the candidate the
whole co-driver call (`openNote`), with the combination's hardest severity.

The bar then relaxes with distance, which is the "prefer tight corners"
rule stated as an algorithm:

| Road since the last board | What earns a board |
| ------------------------- | ------------------ |
| under `early` × gap       | nothing            |
| `early` × gap to the gap  | a HARD corner      |
| the gap to `late` × gap   | hard or medium     |
| past `late` × gap         | any turn at all    |

In practice that puts a board after a medium or hard corner more than nine
times in ten, at a mean gap a little over the target — a stage would rather
carry an extra hundred metres than mark a bend nobody had to think about.
`make track` draws them on the schematic, which is how the placement is
judged.

An endless stage places them the same way as it streams; a circuit's boards
belong to the LAP and are driven through again on each one.

## Kerb placement (R26)

Kerbing is placed for a reason, and there are only four of them. A stage edged in stripes from end to end is a bobsleigh run with trees
behind it; kerbing at the corners that earn it is a road with a rally on it,
and it is also readable — a driver at 160 km/h has about a second to take in
what the road is telling them, so the marking has to mean something.

`engine/mapgen/kerbs.ts` decides WHERE — arc-span zones per side, and the
list of MARKERS those zones become; `pwa/src/game/kerbs.ts` decides what one
looks like. The placement is engine-side because one of the markers is
solid: the contact model collides the same list the renderer draws, so the
slab that throws a cut apex is a slab the player could see coming.

| Role       | Where it goes                                                           | What it says                                                                                      |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **apex**   | the INSIDE of the bend, around its tightest point                       | "Aim here." The target that defines the line, and what stops it being cut into the ditch.         |
| **exit**   | the OUTSIDE, from where the corner stops bending out along the straight | "The road ends here." Centrifugal force takes the car wide under power; this is the usable width. |
| **entry**  | the OUTSIDE, on the approach to a hard corner                           | "Brake." A braking marker — so it only appears in front of a corner that needs braking for.       |
| **hazard** | both sides, wrapped around a bridge deck or a jump lip's shoulders      | "This one will hurt." High-risk collision zones, marked all the way round.                        |

Corners under `kerb.minAngle` (~41°) get nothing at all, which is what makes
kerbing an event: on a stage of soft sweepers almost nothing is marked, and
the one hairpin reads from a long way out. Only corners past
`kerb.entryAngle` also earn a braking marker.

**What is built there depends on the surface.** Tarmac gets a low-profile
continuous kerb running through the whole zone. Gravel does not: a poured
concrete kerb down the side of a forest road is a lie, so a dirt stage is
marked with a run of orange-and-white marker posts at `kerb.postSpacing`, and
anti-cut blocks at an apex (`kerb.blockSpacing`) where cutting is the
temptation. Discrete objects with country between them, never a painted band.

Orange rather than the rally red the real thing is painted in, and the reason
is what the colour SAYS at speed: red is this game's colour for something
having gone wrong — the tape across a closed branch, the damage instrument,
the marker on the map — so a corner lined in it reads as a reprimand for a
line the player has not even taken yet.

**A post and a block part company at the contact model.** A post stops
nothing and never reaches the physics: the renderer knocks it flat off the
same body box the engine would have used, like a marshal's cone. A block is
SOLID, and the one piece of scenery in the game the car may hit with nothing
breaking — it costs speed, rolls the body, shoves the car back out of the
inside of the corner and thuds, and it never folds a panel
(`TUNING.collision.kerb`, resolved by `clipKerbs`). Cutting an apex has to be
paid for, not punished with the run.

## Rolling elevation

Generated stages are genuinely 3D: under the feature ramps, `compileStage` sums octaves of seeded value NOISE along arc length (`STAGE_RULES.elevation`), each octave half as long and a fraction as tall as the one above it. Noise rather than sine waves because a sine repeats — every rise the same shape as the last — and octaves shorter than a few dozen meters are not hills at all but a washboard: on a road sampled every 2 m they flip the grade back and forth every ripple, which is what the eye actually sees. Per-stage character (how tall, how long, how rough) is drawn from the rule ranges, so one seed rolls and the next is nearly flat. Grades live on the straights and flatten through corners (`straightness` in `compile.ts`) — partly stage-design taste, partly load-bearing: a car cutting inside a turn sweeps whole samples of arc per physics step, and a real grade across that sweep would read as the ground falling away. Fords carve their own dips into the profile (R12): the water lies flat below the lowest surrounding grade, with the approach eased over an apron on each side. Synthetic tracks (`compileTrack(seed, segments)`) stay flat rigs so scripted physics tests measure exactly what they script.

## Determinism and the daily stage

`generateStage(seed, length)` → `compileStage(seed, length)` is deterministic end to end: the same seed always builds the same stage, on every device — endless streams included. The app seeds from the day number, so everyone drives the same stage today; each finish advances to the next seed. Seeds are also the bug-report currency (the HUD shows the stage seed).

## Looking at the output

```sh
make track                                  # previews/track-1..6.png (medium)
npm run track -- --seeds 42,99              # specific seeds
npm run track -- --length xlong             # a stage length band
npm run track -- --shape circuit            # a closed lap circuit (R22)
npm run track -- --length endless --km 8    # a streamed endless stretch
npm run track -- --zoom junctions           # one close-up per junction
npm run track -- --zoom junctions --span 45 # ...and how much country around it
```

and writes TWO pictures per seed:

- `track-<seed>.png` — the **schematic**: the route as a map. Surfaces (gravel / asphalt / deck / ford), jump lips, crests, the branches at each junction, and the corner guards, in colors that can be told apart at a glance while judging the rules.
- `track-<seed>-render.png` — the **place**: the shaded landscape with its lakes and rivers and forest, and the road drawn across its full width — wheel tracks, shoulders, markings, bridges, junctions, and the branches running off the map. The racing route is called out in magenta with direction arrows, because the stage and the roads it borrows are the same kind of road and at a whole stage's zoom they look it.

A whole stage's frame resolves a junction, a bridge or a guarded hairpin as a few dozen pixels — not enough to tell a built place from a collision of two ribbons. `--zoom junctions` re-frames the same renderer tightly around each junction the seed produced, which is the loop for working on them: change a number, re-render, LOOK.

The frame fits the road and lets the nature fill the rest, so a longer stage renders from further up. Dials pass straight through (`npm run track -- --elevation 1 --water 0.9`), which is the fastest way to see what one does. Pair with `make sim` (`--length` picks the band) — a rules change must keep bots finishing (see [simulation.md](simulation.md)).

## Extending the vocabulary

New content kinds (say, tunnels or level crossings) follow the pattern: a feature enum value + placement rules in `rules.ts`, placement logic in `assignFeature`, geometry in `compile.ts`, an R-rule stated in prose in both files and this document, and an invariant test in `tests/mapgen_test.ts`. The renderer picks the feature up from the samples.
