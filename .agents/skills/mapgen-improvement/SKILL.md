---
name: mapgen-improvement
description: "Use when improving the STAGE GENERATOR (engine/mapgen/) — the rules engine that builds every stage fresh from its seed, and the layered ground it lays them on. Owns the module split (rules.ts data / generate.ts search / compile.ts geometry / geology, road, spurs, guards, river), the R-rules and where each is stated, the four stage dials, and above all the LOOP: write, generate, ANALYZE (`make analyze` scores the stage and names what is wrong with it), fix, reflect on whether the analyzer measured the right thing, iterate on that seed until it is clean, then take another seed. Also the invariants (determinism, sub-seed rejection, docs sync) that are load-bearing and easy to undo by accident."
---

# Improving the Stage Generator

A change here lands on **every stage on every seed at once** — today's daily
stage, every future one, and every stage in every test sweep. That leverage
cuts both ways: a regression you cannot see on the seed you happened to render
is still shipping on the other several thousand.

Which is why the centre of this skill is not the rules. It is the LOOP.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs mapgen-improvement --list`, then the ones this
task touches (`--scope=…`, `--concepts=…`). Load **`skill-reflection`** at
both ends of the session, and **`write-code`** beside this one.

---

## THE LOOP

```
   1. write code
   2. generate a level          make analyze SEEDS=7   (builds it and scores it)
   3. run the analytics         …read the FINDINGS, not the score
   4. improve the generator     fix the worst finding
   5. reflect on the ANALYSIS   was that a defect, or a check measuring wrong?
   6. iterate on this seed      until it comes up clean
   7. take a different seed     and do it all again
   8. when several seeds hold   make sim, make track, then commit
```

**Step 5 is the one that is easy to skip and the one that makes the rest worth
doing.** An analyzer is only as honest as its checks, and the fastest route to
a hundred out of a hundred is to measure things that were never going to fail.
Every time a finding comes up, ask which of three things it is:

| The finding is…                                | Do                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| A real defect                                  | Fix the GENERATOR. This is the normal case and the point of the tool.           |
| A check measuring the wrong thing              | Fix the CHECK, in `engine/analysis/`. Say why in the comment.                   |
| A real property of the game, scored as a fault | Move the threshold in `budgets.ts` — **and only with a MEASUREMENT behind it.** |

Telling the first row from the second: **instruments agreeing on a LOCATION is
evidence, and a finding that appears on every seed at the same VALUE is the
measurement bug.** Three checks firing at one place on the map are three views
of one defect; three checks reporting 0.42 on every seed are one check with a
constant in it.

That third row is where honesty goes to die. A threshold moved because a seed
failed it is a threshold that will be moved again next time. A threshold moved
because `make sim` shows three cars landing those jumps with zero respawns is
a threshold with evidence under it — write the evidence into the comment, so
the next session can judge it instead of inheriting it.

**Never widen a budget to make the exit code green.** The exit code is
information. A sweep that reports twenty errors and a mean of 94 is a working
instrument pointing at a queue of work; the same sweep reporting zero after
somebody doubled the tolerances is a broken one.

### If it can be measured, the ask comes with a CHECK

**When somebody asks for something to be added or fixed here, and no existing
check can tell whether it is right, writing that check is part of the job —
not a follow-up.** Ship the change and the instrument together, in the same
pass.

The reason is that this generator has no other memory. A stage is built fresh
from its seed every time, so a quality nobody measures is a quality that
survives exactly until the next tuning pass moves a number underneath it. "The
road should be bumpy" without a bumpiness check is a number somebody will
smooth out in six weeks, on a seed that looked better for it, with nothing to
say it got worse.

So, for any ask:

1. **Name the property in one sentence** — "water ends somewhere", "the road is
   not a perfect ribbon", "swamps are shallow and wide".
2. **Ask whether an existing check already covers it.** Extend the check if it
   nearly does; a new one if it does not. `--checks` prints every check that
   ran, which is how you find out.
3. **Decide the shape of the check before the threshold.** Most defects are
   `under()` (a step, a climb, a cost). Anything with a RIGHT AMOUNT is
   `within()` — a band that penalises too little as well as too much. Water
   share, forest share, bumpiness and corridor width are all bands: a stage
   with no bumps is as wrong as one that is all bumps, and only a band says so.
4. **Put the threshold in `budgets.ts` with the reason next to it**, and the
   weight in `ANALYSIS.weights`.
5. **Then build the thing** — and use the check to tell you when it is right,
   which is the entire point of having built it first.

A property that genuinely cannot be measured — "does this stage feel like a
rally stage" — is what `make track` and the sim are for. Say so out loud when
that is the answer, rather than inventing a number that stands in for it
badly; a check measuring a proxy nobody believes is worse than no check,
because it will be optimised against.

---

## The two halves: LOOK and MEASURE

Everything here is invisible until somebody looks at it, and half of it is
invisible even then.

**`make track` is the looking half.** Two pictures per seed:

```sh
make track                        # two pictures per seed, 1..6
npm run track -- --seeds 42,99    # specific seeds
npm run track -- --water 1 --elevation 1   # what a dial actually does
npm run track -- --zoom junctions --span 45   # one close-up per junction
```

- `track-<seed>.png` — the **schematic**: surfaces, features, junctions,
  guards. Judge the RULES here.
- `track-<seed>-render.png` — the **place**: shaded landscape, water, forest,
  the road at full width, the route in magenta. Judge whether the world reads
  as a world here.

Both are drawn from above at one fixed scale. When a finding names a PLACE
and the question is what the ground is MADE of there, the third looking tool
is the **map's debug layers** in the game itself — bedrock, groundwater,
soil, foliage and roads painted over the live stage, with zoom that runs
down to a few metres and a pan that reaches the part of the stage in
question. `make screenshots shot-map` captures the sheet; the
**`debug-tools`** skill owns it.

**`make analyze` is the measuring half.** Seven metrics, each a set of checks,
each check a number with a threshold:

```sh
make analyze SEEDS=7              # one seed, everything it can say
make analyze SEEDS=7 ARGS=--checks   # ...including every check that passed
make analyze COUNT=24             # the sweep, with a tally of what is commonest
npm run analyze -- --json out.json   # machine-readable
```

| Metric    | Asks                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `rollers` | Is the SURFACE sound — steps, walls, hollows, solids in the road, water on it |
| `water`   | Does the water obey nature — downhill, gathering, in the ground, ending       |
| `roads`   | Does the NETWORK make sense — branches go somewhere, nothing doubles up       |
| `drive`   | Can a modest car DRIVE it — grades, crests, camber, corners with no run-up    |
| `jumps`   | How far, how high, how hard — and is the road there when it lands             |
| `ends`    | Pass/fail: does the start hold the field, does the finish work                |
| `perf`    | What it COST to build, and to query once built                                |

They answer different questions and they both lie on their own. The renderer
shows you a river that floats; only the analyzer knows it floats on nineteen
of the twenty-four seeds you did not render. The analyzer scores a stage 97;
only the picture shows you it reads as a noodle.

**Use both, every time.** Neither is optional on a generator change.

---

## The analyzer's own budget

The two halves of this loop have OPPOSITE cost budgets, and keeping that
straight is load-bearing:

- **The generator runs in the game.** On a phone, behind a loading card, every
  time a stage starts — and then its terrain field is queried thousands of
  times a second for as long as the run lasts. It has to stay fast.
- **The analyzer runs here.** It may be far more expensive than the thing it
  measures, and several of its checks deliberately are: it takes gradients the
  generator cannot afford, sweeps ten thousand ground cells, and rolls fifty
  lanes down the stage.

That asymmetry only stays true because the analyzer TIMES the generator: the
`perf` metric rebuilds a stage cold and meters `groundAt`, `waterAt` and
`obstaclesNear` per call. **A landscape change that buys a nicer world with
four times the per-query cost is a regression, and it is one every other
metric would report as an improvement.** That is what `perf` is for.

The analyzer is also the thing being iterated WITH, so it has a budget of its
own: a seed is around half a second, a sweep of eight a few seconds. Its
sampling densities are data (`ANALYSIS.sampling`) — if a new check makes a
sweep take a minute, the check needs to get cheaper or the loop stops being a
loop. `--no-perf` skips the cold rebuild when the question is "does this seed
hold water" rather than "did my change cost anything".

---

## The modules, and their jobs

| File            | Job                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules.ts`      | **The rule book.** Every constraint and vocabulary number as DATA. Tuning the generator means editing this file.                                                                                                                        |
| `biomes.ts`     | **The countries (R40).** The quilt, the water, the loose surface, the relief, the dunes and the sky per biome, as rows. `knobs.biome` picks one; nothing else in `mapgen/` names a country.                                             |
| `generate.ts`   | **The search.** Draws candidates, validates against the rules, retries bounded, backtracks, rejects a whole attempt rather than ever shipping a violation.                                                                              |
| `compile.ts`    | **The geometry.** Turns the plan into evenly spaced samples — the single geometric truth read by physics, renderer and bots alike.                                                                                                      |
| `geology.ts`    | **The GROUND, in layers (R32).** Bedrock with its glacial smoothness, the groundwater table in it, the soil on top. Everything about the country that is not the road.                                                                  |
| `land.ts`       | The road builder's view of that ground: how high is it, can I build here.                                                                                                                                                               |
| `road.ts`       | **The cross-section.** What a road is ACROSS its width. Read by renderer, terrain AND physics — change it once, all three move.                                                                                                         |
| `spurs.ts`      | **The other roads.** The branch each junction abandons: real road that runs off the map.                                                                                                                                                |
| `homesteads.ts` | **The country somebody lives in (R37).** A house on a yard, a car or two, a lane of trees, and a dirt drive meeting the stage square. Its own list on the track, NOT a spur: the analysis judges a branch by whether it leaves the map. |
| `guards.ts`     | **The corner guards (R14).**                                                                                                                                                                                                            |
| `river.ts`      | **The water (R18).** One watercourse per valley, traced by the rules of nature.                                                                                                                                                         |
| `terrain.ts`    | The field that shapes all of it around the road, and answers every query the game makes about the world.                                                                                                                                |

And the scoreboard, which is NOT in `mapgen/` on purpose:

| File                  | Job                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/analysis/`    | One module per metric. It reads `mapgen`, `game` AND `sim`, so it sits above all three — a check about the start grid imports the real grid code rather than keeping a copy of the rules. |
| `analysis/budgets.ts` | **Every threshold, as data.** `rules.ts`'s opposite number: that one says what may be BUILT, this one says what the result has to COME OUT like.                                          |

Keep the splits. A placement decision in `compile.ts`, a geometric fudge in
`generate.ts`, or a bare threshold inside a check instead of in `budgets.ts`,
is how these modules rot.

---

## Rules of nature

The generator's job is not just legality, it is PLAUSIBILITY — a stage has to
read as country somebody laid a road across. Each of these is now also a
CHECK, which is the point: a rule of nature that is only prose gets undone by
the next tuning pass without anybody noticing.

- **The ground is LAYERS, and what is on it follows from them (R32).** Rock,
  then the water in it, then the soil. Trees need a rooting depth; bare rock
  grows moss and grass and nothing with a trunk; stone lies on the surface
  where the cover is thin and is buried where it is deep. Get the layering
  right and the flora places itself. → `ground.soil`, `ground.rooting`
- **Water runs downhill, collects, and ends somewhere.** One watercourse per
  valley (R18), not one per ford. Born above its highest crossing, visiting
  the rest in descending order, widening as it goes, ending in the lowest
  water it can find — a lake, a sea basin, off the map, or, where there is
  nowhere lower, a POOL it makes itself. Two crossings with a ridge or a deep
  basin between them are on different water: split the course, never run water
  over the ridge. → `water.uphill`, `water.gather`, `water.mouth`,
  `water.float`
- **Roads lead somewhere.** A road that ends in a field is a bug you can see
  from a kilometre up. Every branch runs off the map (R17). → `roads.stranded`
- **No two roads share ground, and none run side by side (R23).** That binds a
  branch against the stage, against OTHER branches, and against its own line —
  a wander that folds back over itself is two roads that happen to be one.
  → `roads.overlap`, `roads.parallel`
- **Roads MEET, they do not merge.** A junction is planned: at a corner, ON
  the road, one road straight through, both borders cut away, one graded
  plane.
- **A corner has an inside.** If the grass across it is faster than the road
  around it, the corner does not exist (R14).
- **A stage has two ENDS, and they are pass or fail.** The start apron holds
  the whole heads-up field with a straight to string out on; the finish line
  spans road a car must cross, with R25's run-out past it to settle down on.
  → the `ends` metric

When something looks wrong in a render, ask which rule of nature it breaks
before reaching for a number.

---

## The dials

A COUNTRY first (`knobs.biome`, R40 — the taiga or the desert: which set of
ranges everything below is read against; `--biome desert` on every tool),
then four knobs — `elevation`, `water`, `trees`, `asphalt` (plus `width`), each
`0..1` — say what KIND of stage a seed builds. They must never break a rule: a
dial moves the RANGE a rule draws from, it does not switch a rule off. Every
entry point takes them, and a track carries the dials it was built with
(`track.knobs`).

**The geology's `smoothness` is deliberately NOT a dial.** It is drawn per
seed, because it says which COUNTRY a stage is in — how long the ice sat on it
— and that is not a slider anybody was asked about. Sweden and Norway are the
same rock.

Analyze at the extremes, not only at the defaults:
`npm run analyze -- --water 1 --elevation 1` and `--water 0 --elevation 0`
find different bugs, and a dial that breaks a rule at its end is the most
common way a rule stops being one.

---

## Extending the vocabulary

A new stage ingredient follows the settled pattern, in order:

1. A feature enum value + its placement rules in `rules.ts` — data first; if
   the constraint can't be expressed there, the design isn't ready.
2. Placement logic in `generate.ts` (`assignFeature` and the validation).
3. Geometry in `compile.ts` — the samples carry what physics and renderer
   need, and they are the ONLY channel.
4. An R-rule stated in prose in `rules.ts`'s header AND
   `docs/track-generator.md`.
5. An invariant test across seeds in `tests/mapgen_test.ts`.
6. **A CHECK in `engine/analysis/`, with its thresholds in `budgets.ts`.** A
   test says the rule held on eight seeds; a check says how well it is holding
   on whatever seed anybody is looking at, and it is what makes the feature
   part of the loop rather than a thing that was added once.
7. Physics (the `engine-system` skill) and rendering.

Skip 4, 5 or 6 and the rule exists only as behaviour — the next tuning pass
undoes it without knowing it was ever a rule.

---

## Invariants — load-bearing, and easy to undo by accident

- **`generateStage(seed)` is a pure function of the seed.** Every draw comes
  from the seeded RNG. The daily stage, shareable seeds and the sim digests
  all hang off it. So does the analyzer: a report that differs between two
  runs of the same seed means something is reading a clock or a global.
- **Reject, never repair.** A candidate that violates a rule is retried or
  backtracked; a failed attempt re-rolls with a derived sub-seed. A "fix it up
  afterwards" pass is how subtle violations ship.
- **The self-distance check (R10) exempts route neighbours.** Tightening it
  without the window outlaws hairpins; loosening the window lets the stage
  fold.
- **R23's junction exemption is stated ONCE** (`STAGE_RULES.junction.parting`)
  and read by the branch builder AND the analysis. A branch leaves a junction
  ON the road it is leaving; an analyzer that does not exempt exactly the same
  stretch reports every junction on the map as two roads sharing ground. It is
  a PLACE — ground distance from the meeting point — and never a window of
  stage arc: an arc window forgives whatever the route has wandered into
  hundreds of metres away, and both sides forgiving it is how four real
  overlaps went unreported across seeds 1-12.
- **Where the search TRIAL-BUILDS what the compiler builds for real, the trial
  is the stricter of the two.** Several rules are decided twice — "could a
  branch leave the map from this corner" against the country the plan
  describes, then the real arm against the country that got built — and the
  two answers are never identical. A trial more OPTIMISTIC than the build
  accepts a corner whose arm is then cut short, and ships a stub of tarmac
  standing in a field; a trial more pessimistic just loses a junction and the
  search draws another corner. So state the threshold twice, deliberately,
  with the slack in the safe direction (`TRIAL_PARTING` under
  `BUILT_PARTING`). One shared constant looks tidier and is the bug — and the
  analysis needs the same asymmetry the other way, or it measures the built
  stage with the builder's own tolerance and reports nothing, ever.
- **A commit made of SEVERAL segments unwinds WHOLE.** Backtracking pops one
  plan at a time, which is right for plans drawn on their own and wrong for a
  borrow — a turn on, a run along the road, a turn off, legal only together.
  Pop one and what is left is the violation the feature exists to prevent. Any
  composite commit records the span it occupies and the single retreat path
  pops the whole of it; which means there has to BE a single retreat path.
- **Vocabulary numbers are a coupled system.** The turn radii, the bot's
  `latAccel` plan, the drift tuning and the grid's catch-up window all agree
  with each other. Lengthen the start apron and `TUNING.massStart.catchUpS`
  has to grow with it; shallow the jump ramps and the sim's air time moves.
  That is what the sim sweep is for.
- **Stages must stay finishable by both cars.** `tests/simulation_test.ts` is
  the contract.
- **The terrain field must never shape itself around the road it is not
  nearest to.** Corridor shelves, spur shelves and junction aprons overlap;
  whichever road is nearer owns the ground.
- **Sample spacing is only APPROXIMATELY `SAMPLE_STEP`.** Anything that has to
  land on a sample AT a given arc position must SEARCH the samples or carry
  the index it was built with. `Math.round(s / track.step)` is off by several
  samples by the end of a long stage.
- **`smooth()` is a Hermite fade, not a curve.** Outside `0..1` it turns over
  and runs away. Every call needs `clamp01` around its argument.
- **A `min` against a field that stops being asked at a range ends in a
  WALL.** R31's cone is a min over every road within its query reach; where
  the reach ends and the country is still above the cone, the ground stands
  up the whole difference in one lattice column. Anything shaped off a
  distance query has to be finished — lifted off, blended out — INSIDE the
  reach the index guarantees (`verge.fade`, `SPUR_INDEX_REACH`), and
  `ground.wall` is the check that says whether it was.
- **Sharp is measured on the drawn lattice, never on the field.** Every
  layer is C1; what creases is the 14 m triangulation of it. `ground.crease`
  folds the lattice and holds the country to a curve, exempting only what a
  road built and what `geology.sharpAt` says the rock made sharp on purpose
  — and sharp is the `steepness` dial's, opened past its midpoint, never a
  side effect of the seed.
- **Two roads at two heights start in the PLAN, not in the ground.** Before
  shaping the terrain under a step across a junction arm, measure where the
  roads are: the borrowed run against the highway's own points, entry to
  exit (`followRoad` walks every bend of the road as a turn of its own
  radius, whichever way the road is run — what is straight is
  `straightPart`'s answer, for R38, R4 and the co-driver alike), and the
  highway against itself (`layOne` keeps off its own line past its radius
  of arc). The platform, `PLATFORM_HOLD`, the barrier placer and
  `junctionOverlap` all assume the arm leaves along the main road's line;
  with the roads a road width apart from where the plan put them, no
  ground rule can make them agree.

---

## Shipping

- **`make analyze COUNT=24` before and after**, and the finding tally in the
  PR. That tally is the honest summary of a generator change: which classes
  went away, which appeared, which are still open.
  - **Compare TALLIES, never seeds.** Any change to the rules re-rolls the
    search, so seed 7 after is a different stage from seed 7 before — its
    score, its length and its findings all move for reasons that have
    nothing to do with what you did. A seed-to-seed diff is noise wearing a
    number, and it is the fastest way to spend an afternoon chasing a
    regression that is a different stage. The same goes for `make sim`: read
    the closing line over a wide sweep, not a row.
- **Both `make sim` tables** (before/after) in the PR — the `commit` skill's
  contract for generator changes. Bots must keep finishing and keep drifting.
- **Render BOTH pictures at more than one seed** and put the images in front
  of the user. A change that looked fine on seed 3 has been wrong on the next
  seed more than once.
- Zoom in on what the whole-stage frame cannot resolve — a junction, a bridge,
  a guarded hairpin.
- `docs/track-generator.md` updated if any rule moved (the verbatim list, and
  the scoring table if a metric changed).
- A `.changes/unreleased/` fragment: generator changes are player-visible by
  definition.

## Skill self-improvement

Load **`skill-reflection`** before this session commits. Worth recording here:
a tell in a render, a lever that reliably fixes a look problem, a coupling
between a rule number and the handling — and, specifically for the analyzer,
any check that turned out to be measuring the wrong thing, because that is the
failure mode this whole instrument has.
