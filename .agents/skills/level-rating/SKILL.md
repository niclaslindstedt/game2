---
name: level-rating
description: "Use when judging whether a generated stage is any GOOD as a rally stage rather than merely correct, when choosing or replacing CAMPAIGN levels, or when a generator change has to be judged by what it does to the whole seed population. Owns `make rate` and `engine/rating/` — the trait bands, the character fingerprint, the difficulty index, the which-car-is-this-road-for demand, and the ladder scorer that judges six levels TOGETHER. Three loops: calibrating a band from a measured population, curating a campaign ladder, and reading a rules change as a distribution rather than as one seed."
---

# Rating a level, and picking a campaign out of them

`make analyze` asks whether a stage is BROKEN. This asks whether it is any
GOOD, and the two are genuinely different questions: the generator's search
only knows how to avoid breaking rules, and a seed that breaks none of them is
where the interesting question starts. A stage can be flawless by `analyze`
and be a scribble across a field.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs level-rating --list`, then the ones this task
touches. Load **`skill-reflection`** at both ends, and **`write-code`** beside
this one for any code change. Load **`mapgen-improvement`** when the answer
turns out to be a change to the generator, and **`simulate-run`** whenever a
level is about to move — the bot is the only thing that knows whether the
ladder climbs in the game rather than on paper.

---

## The three loops

Pick the one that matches the question. They share a tool and nothing else.

```
A. CALIBRATE   is the tool measuring the right thing?     make rate --stats
B. CURATE      are these six stages a campaign?           make rate CAMPAIGN=1
C. GENERATE    did my rules change make stages better?    make rate --stats, before and after
```

---

## What the tool actually says

```sh
make rate SEEDS=38 ARGS=--traits      # one seed, every trait, band and remark
make rate COUNT=64                    # a sweep to shortlist from
make rate COUNT=120 ARGS=--stats      # the POPULATION — what the generator builds
make rate CAMPAIGN=1                  # the committed ladder, audited as a set
make rate COUNT=200 ARGS="--pick 4"   # propose a ladder out of a sweep
make rate BIOME=desert LENGTH=long SHAPE=circuit
```

**RATE ONLY A STAGE THAT PASSES `make analyze` FIRST.** The rating assumes an
analyzable road, and on one that is not it reports honestly enormous numbers
rather than nothing — an alpine circuit that `analyze` fails with sixty-four
errors comes back here with a 211% sustained grade and an undulation of 93
m/s², because that is genuinely what the road does. Those are not rating bugs
and chasing them as if they were is a wasted afternoon; the seed is broken and
belongs to `mapgen-improvement`.

**Six facets, each a set of BANDS.** `flow` (what the road asks of the hands),
`pace` (how fast, and how much the speed moves), `relief` (up and down, and
what that does to a corner), `features` (the set pieces and how many KINDS),
`scenery` (the country around it), `risk` (what a mistake costs). A band has a
floor as well as a ceiling — that is the whole difference from `analyze` —
because a road with no corners scores as badly as a road that is nothing but
corners.

**The CHARACTER is not the score, and the campaign is built out of the
character.** Nine axes — tight, fast, vertical, airborne, sealed, enclosed,
exposed, slick, long — each 0..1 and none of them better than another. The
score says whether a stage is good; the character says whether it is UNLIKE
its neighbour, and a ladder needs both.

**`difficulty` orders the ladder, and it is not the score.** A gentle opening
stage should be easy AND good.

**`demand` says which of the three cars the road is for**, as three shares.
It is an invitation, not a verdict: `npm run sim -- --sweep` says which car
actually wins on it, and that is the one that is right about the game.

---

## LOOP A — calibrating a band

The scoreboard is only as honest as its bands, and the fastest route to a
hundred out of a hundred is to measure things that were never going to fail.

```
   1. make rate COUNT=120 ARGS=--stats     across a country, a length, a shape
   2. read the `in` column                 the share of the sweep inside the band
   3. move the band, or the measurement    — the decision below
   4. re-sweep and read it again
   5. LOOK at the extremes                 make track SEEDS=<best>,<worst>
```

**The `in` column is the whole loop.** A healthy band is one a third to two
thirds of the sweep clears.

| What `--stats` shows                | What it means                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| ~100% in band                       | The trait is measuring nothing and its weight is spent on a constant. Tighten it, or demote it to a GUARD with a low weight and say so in `scales.ts`. |
| ~0% in band                         | A wish, not a threshold. Either the generator cannot build it (move the band) or the measurement is wrong (fix the code). |
| A distribution with no spread       | The trait is a restatement of another one. `flow.switches` was `flow.corners` with a constant on it until it became a share. |
| An absurd max                       | A measurement bug, always. A 211% grade was a level-crossing ramp read as road. |

**Which to move — the band or the measurement — is the judgement this loop is
about, and it is settled by LOOKING.** Render the seeds at both ends
(`make track SEEDS=…`, then read the PNG) and ask whether the picture agrees
with the number. Two real examples from building this tool:

- `scenery.groundMix` scored a flat green field a perfect 100. The band was
  not wrong; the MEASUREMENT was, because a normalized entropy asks "of the
  kinds you have, are they evenly split" and every dull stage passes that.
  It became an effective COUNT of kinds.
- `risk.exposure` came back zero across the whole game. Also the measurement:
  R31 grades a cone of ground beside every road, so read at the shoulder the
  trait was measuring the rule rather than the country.

**A number borrowed from outside this project does not move to make the tool
discriminate better.** `scales.ts` lists which ones those are and where each
came from — the pacenote radii, the FIA's 130 km/h, arcade's ±30% speed
spread and on-camber rule, the twenty-second section floor. If the population
sits comfortably inside one of those, that is the generator being right.

---

## LOOP B — curating a campaign ladder

The failure this exists to prevent: take the sweep, sort by score, keep the
top six. Every one is a good stage and the campaign is terrible, because they
score well for the same reasons and are the same road six times.

```
   1. make rate CAMPAIGN=1                 audit what is committed
   2. read the LADDER traits               climb, spread, step, apart, identity,
                                           conditions, cars, formats, quality
   3. find the weak rung                   the note names it by level name
   4. search for a replacement             make rate COUNT=200 BIOME=<country> LENGTH=<band>
   5. shortlist on CHARACTER               ARGS="--pick 6", or by hand from the axes
   6. CONFIRM the candidate in the game     see below — this step is not optional
   7. edit pwa/src/game/campaign.ts        seed, length, shape, hour, weather, season, blurb
   8. re-audit, re-shoot the previews
```

**Step 6 is where a shortlist becomes a decision.** The rating is a compass
over geometry; three other tools know things it does not:

```sh
npm run sim -- --seeds <seed> --length <band>   # does the BOT agree it is harder?
make level SEED=<seed> LENGTH=<band>            # what is actually on the road, by id
make track SEEDS=<seed> --length <band>         # what it LOOKS like — open the PNG
```

A candidate that the rating loves and the sim finishes two seconds quicker
than the rung below it is not a harder stage, whatever `difficulty` says.

**What each ladder trait is actually asking:**

| Trait              | The question                                                    | The usual fix                                                        |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ladder.climb`     | Does difficulty go up in the order they are played?             | Reorder before replacing — often the stages are right and the order is not. |
| `ladder.spread`    | Does the last one ask more than the first?                      | Replace the opener with something gentler, not the closer with something harder. |
| `ladder.step`      | Is there a wall in the middle?                                  | The rung AFTER the step is the problem, not the one before it.        |
| `ladder.apart`     | Are the two most similar stages actually different roads?       | The note names both and the axes they share. Replace ONE of them.     |
| `ladder.identity`  | Does every rung lead the ladder on something?                   | A stage that leads on nothing is filler — replace it with an extreme. |
| `ladder.conditions`| Does it use the weather, the calendar and the clock?            | The cheapest fix in the game: change an `hour`, a `weather`, a `season`. Change nothing about the road. |
| `ladder.cars`      | Is every car in the garage the right car somewhere?             | Needs a ROAD change: sealed and fast for the compact, open and long for the coupé, loose and tight for the classic. |
| `ladder.formats`   | Sprints and circuits, more than one length band?                | A `shape` or a `length` on an existing level.                         |
| `ladder.quality`   | Are they good roads?                                            | Variety is not a licence for six bad stages that are bad differently.  |

**Try the conditions before you try the seeds.** An `hour`, a `weather` and a
`season` are three levers that cost nothing, change nothing that was verified,
and move `ladder.conditions` on their own. A seed change re-rolls the road, the
previews, the sim times and the routes in the menu. One exception: a WINTER
level is a different ROAD (R48 — the lakes freeze and the route may cross
them), so `--season winter` on `make rate` and `make analyze` is not optional
when a level is set in one.

**THE SCORE SATURATES, SO SEARCH AGAINST A BRIEF RATHER THAN AGAINST THE
SCORE.** Every ladder trait is a band, so a set that clears all nine reads 100.0
however it clears them — and a search told to maximise the number lands every
band on its edge: `spread` on its floor (the last stage asking barely more than
the first), `step` on its ceiling, two rungs a thousandth apart. Hold a
shortlist to a brief instead, and read the score as a pass mark:

- every rung asks MORE than the one under it, by enough to feel (about 0.035)
  and not so much it is a wall (`ladder.step`'s ceiling)
- `spread` in the MIDDLE of its band, not on its floor
- no seed twice in a country, and no two rungs under the same sky
- as few `make analyze` errors as the slot allows

**That last one is not a tiebreak, and it is the one the rating cannot see.**
`make rate` assumes an analyzable road and reports honestly enormous numbers on
one that is not; a pass chosen on the rating alone put a road carrying
EIGHTY-ONE R-rule violations into a ladder at a rating of 84. Sweep
`analyzeSeed`'s `errors` over the same candidates and carry it into the pick.

**What a level change owes** (`CLAUDE.md`'s sync points):

- `make previews` — the campaign's stage boxes and biome banners are generator
  OUTPUT. A re-seeded level leaves a picture of a stage that no longer exists.
  A country's FIRST level owns its banner, and a banner is a LOOK test the
  rating cannot make: open the JPEG.
- `npm run sim` for the new stage, and the ladder's times in `campaign.ts`'s
  own header comment if they are quoted there.
- `tests/campaign_test.ts` if the ladder's shape changed — and note that a
  country's own invariants live there (the alps start beside the snow and
  their sprints come DOWN; the desert has sand and no water), so they are a
  filter on the candidate pool, not a check at the end.
- **Everything else that PINS A LEVEL ID.** A re-seeded level silently
  invalidates them, and nothing fails: `pwa/src/game/benchmark-plan.ts` (the
  stage the in-game benchmark runs, chosen by measurement) and
  `scripts/store-shots/recipes.mjs` (each frame is a level plus a distance
  along that exact road). `grep` for the ids before calling the change done.

---

## LOOP C — judging a change to the GENERATOR

A rules change lands on every seed at once, so one seed cannot tell you what
it did. The population can.

```
   1. make rate COUNT=120 ARGS=--stats > /tmp/before.txt    on a clean tree
   2. make the change
   3. make rate COUNT=120 ARGS=--stats > /tmp/after.txt
   4. diff the two, per trait
   5. LOOK at a seed whose score moved most, before and after
```

Read the DISTRIBUTION, not the mean score. What matters:

- **A median that moved** is the change doing what it was meant to.
- **A tail that grew** is usually the interesting part: a change that lifts the
  median and doubles the worst case has made the generator less reliable.
- **A trait that stopped varying** is a rule that has become deterministic —
  almost always a regression, whatever it did to the score.
- **A score that went up with no trait moving** is impossible; if you see it,
  the bands moved in the same commit and the comparison is void.

Use the same seed count both times, and the same country, length and shape:
this is a paired comparison and the generator is deterministic, so anything
else is noise you introduced.

---

## Where everything lives

| Thing                                              | File                                    |
| -------------------------------------------------- | --------------------------------------- |
| The bands, the weights, the axis scales             | `engine/rating/scales.ts` — the rule book |
| The shared read of the road (corners, speed, grade) | `engine/rating/walk.ts`                 |
| One facet each                                      | `flow.ts` `pace.ts` `relief.ts` `features.ts` `scenery.ts` `risk.ts` |
| The fingerprint, difficulty, and which car          | `engine/rating/character.ts`            |
| Judging a LADDER and the whole campaign             | `engine/rating/campaign.ts`             |
| The CLI                                             | `scripts/rate-stage.mjs`                |
| The committed ladder itself                         | `pwa/src/game/campaign.ts`              |
| Tests                                               | `tests/rating_test.ts`                  |

**Adding a trait.** It belongs here only if it can be WRONG IN BOTH
DIRECTIONS. A number that is simply better when bigger is a character axis or
a stat, never a trait — as a trait it is a knob to max, and the search will
find the seed that maxes it and nothing else. Add the band to `scales.ts` with
its population beside it, publish any stat `character.ts` reads from the
facet's `stats`, and run Loop A before believing it.

**Never restate a number another module owns.** The reference car is
`ANALYSIS.drive` and is read, not copied — an early draft of `scales.ts`
carried its own `topSpeed: 45` against the analysis's 64 and reported every
stage in the game at 217 km/h.
