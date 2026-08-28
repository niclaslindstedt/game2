---
name: mapgen-improvement
description: "Use when improving the STAGE GENERATOR (engine/mapgen/) — the rules engine that builds every stage fresh from its seed. Covers the module split (rules.ts data / generate.ts search / compile.ts geometry / road, spurs, guards, river), the R-rules and where each is stated, the four stage dials, the render → LOOK → simulate → judge loop over BOTH preview pictures, how to extend the vocabulary with a new feature, and the invariants (determinism, sub-seed rejection, docs sync) that are load-bearing and easy to undo by accident."
---

# Improving the Stage Generator

A change here lands on **every stage on every seed at once** — today's daily
stage, every future one, and every stage in every test sweep. That leverage
cuts both ways: a regression you cannot see on the seed you happened to render
is still shipping on the other several thousand. So render several seeds, and
let the sim sweep drive them all.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs mapgen-improvement --list`, then the ones this
task touches (`--scope=…`, `--concepts=…`). Load **`skill-reflection`** at
both ends of the session.

## The modules, and their jobs

| File          | Job                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rules.ts`    | **The rule book.** Every constraint and vocabulary number as DATA: turn radii/angles per severity, straight lengths, feature placement, world bounds, the self-distance floor. Tuning the generator means editing this file.                                                                           |
| `generate.ts` | **The search.** Draws candidate segments from the seeded RNG, validates each against the rules, retries bounded, backtracks when boxed in, and rejects a whole attempt (retrying with a derived sub-seed) rather than ever shipping a violation. `generateStage(seed)` is a pure function of the seed. |
| `compile.ts`  | **The geometry.** Turns the segment plan into evenly spaced samples (position, heading, elevation, surface, deck, mat lift, curvature, lips) — the single geometric truth read by the physics, the renderer, and the bots alike. Also where the paving field and its junctions live.                   |
| `road.ts`     | **The cross-section.** What a road is ACROSS its width: camber, worn wheel tracks, asphalt mat, shoulder, ditch, and the junction throat. Read by the renderer, the terrain's verge, AND the physics — change it once, all three move.                                                                 |
| `spurs.ts`    | **The other roads.** The branch each junction abandons: real road that runs off the map, taped off at the mouth.                                                                                                                                                                                       |
| `guards.ts`   | **The corner guards (R14).** Mounds and groves that shut the inside of a sharp corner so the fast line is not straight across the grass.                                                                                                                                                               |
| `river.ts`    | **The water (R18).** One watercourse per valley, traced through the road's crossings by the rules of nature rather than one stream sprouting per ford.                                                                                                                                                 |

Keep the split: a placement decision in `compile.ts`, or a geometric fudge in
`generate.ts`, is how this module rots. Rules are data; the search enforces
them; the compiler only realizes what the search already validated.

## The R-rules live in THREE places — keep them agreeing

The rules are stated in prose in the header of `rules.ts`, listed **verbatim**
in `docs/track-generator.md` (that page's sync obligation is in `AGENTS.md`),
and asserted across seeds in `tests/mapgen_test.ts`. R1–R11 today: opening and
closing straights, the two turn severities, braking zones before hard turns,
the same-direction cap, jump/ford/crest placement, world bounds, no
self-crossing, the length band; R12–R18 add the ford dip, bridges, corner
guards, the paving runs, the road's cross-section, junctions, and the river. A
rule changed in one place and not the other two is worse than no rule — the
tests then pin yesterday's reality and the doc describes a generator that
doesn't exist. (R13–R18's tests live in `tests/water_test.ts` and
`tests/roads_test.ts`; `tests/mapgen_test.ts` still owns the plan-level ones.)

## The dials

Four knobs — `elevation`, `water`, `trees`, `asphalt`, each `0..1` — say what
KIND of stage a seed builds (`StageKnobs`, `DEFAULT_KNOBS`, `knobScale` in
`rules.ts`). They must never break a rule: a dial moves the RANGE a rule draws
from, it does not switch a rule off. Every entry point takes them
(`compileStage`, `createGame`, `simulateStage`, `--asphalt` on both CLIs, the
menu, the URL), and a track carries the dials it was built with
(`track.knobs`) so the terrain field and the renderer read the same set
instead of being handed it. When you add a dial-able number, put its band in
`rules.ts` beside the rule it belongs to — never a bare multiplier in a
consumer.

## The loop

Everything here is invisible until somebody looks at it. A stage that
validates and passes every test can still read as a noodle, so **the render
and the sim are the units of judgement, not the plan JSON.**

1. **Render:**

   ```sh
   make track                        # two pictures per seed, 1..6
   npm run track -- --seeds 42,99    # specific seeds
   npm run track -- --count 12       # a wider look
   npm run track -- --water 1 --elevation 1   # what a dial actually does
   npm run track -- --only render    # skip the schematic
   npm run track -- --zoom junctions --span 45   # one close-up per junction
   ```

   Two pictures, and they answer different questions:
   - `track-<seed>.png` — the **schematic**: surfaces, features, junctions,
     guards, in colors that separate at a glance. Judge the RULES here.
   - `track-<seed>-render.png` — the **place**: shaded landscape, water,
     forest, and the road at full width with its wheel tracks, ditches,
     markings, bridges and branches, the route called out in magenta.
     Judge whether the world reads as a world here.

   The rendered picture is the one that catches what the schematic cannot:
   water that floats or runs uphill, roads that stop in a field, junctions
   where two ribbons merge instead of meeting, a landscape that is more lake
   than land. Every one of those shipped invisibly until it was drawn.

2. **LOOK at several seeds**, not one. Judge: does the stage read as a rally
   stage (flow, rhythm, braking zones before hairpins), do features land
   where they make sense, does the line use the world without hugging the
   bound?

3. **Simulate.** `make sim` — bots must keep finishing and keep drifting. A
   rules change that produces legal-but-undrivable geometry shows up as
   respawns and DNFs here before any human drives it (the `simulate-run`
   skill reads the table).

4. **Judge, change ONE lever, loop.** Re-render and re-sim every time. Send
   the track images to the user whenever the judgement is visual — it usually
   is.

5. **Verify** — `npx vitest run tests/mapgen_test.ts` on every edit (fast),
   then the full gates before shipping.

## Rules of nature

The generator's job is not just legality, it is PLAUSIBILITY — a stage has to
read as country somebody laid a road across. The rules that carry that weight:

- **Water runs downhill, collects, and ends somewhere.** One watercourse per
  valley (R18), not one per ford. It is born above its highest crossing,
  visits the rest in descending order, widens as it goes, pools flat where the
  ground dips, and ends in the lowest water it can find. Two crossings with a
  ridge between them are on different water — say so by splitting the course,
  never by running water over the ridge.
- **Roads lead somewhere.** A road that ends in a field is a bug you can see
  from a kilometer up. Every branch runs off the map (R17); where it goes is
  the player's business.
- **Roads MEET, they do not merge.** A junction is planned: it happens at a
  corner, ON the road, one road runs straight through it, the other turns
  onto it, both borders are cut away and the whole crossing is one graded
  plane. Two ribbons that touch tangentially read as a rendering accident,
  because that is what they are.
- **A corner has an inside.** If the grass across it is faster than the road
  around it, the corner does not exist (R14).

When something looks wrong in a render, ask which rule of nature it breaks
before reaching for a number.

## Extending the vocabulary

A new stage ingredient (say, tunnels or level crossings) follows the settled
pattern, in order:

1. A feature enum value + its placement rules (min straight, clearances,
   probabilities) in `rules.ts` — data first; if the constraint can't be
   expressed there, the design isn't ready.
2. Placement logic in `generate.ts` (`assignFeature` and the validation that
   refuses illegal placements).
3. Geometry in `compile.ts` — the samples carry what physics and renderer
   need, and they are the ONLY channel; the renderer picks the feature up
   from the samples, never from the plan.
4. An R-rule stated in prose in `rules.ts`'s header AND
   `docs/track-generator.md`.
5. An invariant test across seeds in `tests/mapgen_test.ts`.
6. Physics for the feature (if any) in `engine/game/` — the `engine-system`
   skill — and rendering in `pwa/src/game/world.ts`.

Skip step 4 or 5 and the rule exists only as behavior — the next tuning pass
undoes it without knowing it was ever a rule.

## Invariants — load-bearing, and easy to undo by accident

- **`generateStage(seed)` is a pure function of the seed.** Every draw comes
  from the seeded RNG; the same seed builds the same stage on every device.
  The daily stage, shareable seeds, and the sim digests all hang off this.
- **Reject, never repair.** When a candidate violates a rule, the search
  retries or backtracks; when a whole attempt fails, it rejects and re-rolls
  with a derived sub-seed. A "fix it up after the fact" pass is how subtle
  violations ship — the output is either rule-clean or regenerated.
- **The self-distance check (R10) exempts route neighbours.** Points within
  the route-neighbour window along the stage may be close (that is what a
  hairpin is); the floor applies beyond it. Tightening the check without the
  window outlaws hairpins; loosening the window lets the stage fold.
- **Vocabulary numbers are a coupled system.** The turn radii, the bot's
  `latAccel` plan, and the drift tuning agree with each other — a hard-turn
  radius band the handling can't drift, or a straight vocabulary too short to
  brake in, is a rules change that breaks the game while every rule holds.
  That is what the sim sweep is for.
- **Stages must stay finishable by both cars.** `tests/simulation_test.ts` is
  the contract; a generator change that breaks it is wrong until argued
  otherwise, explicitly, in the PR.
- **The terrain field must never shape itself around the road it is not
  nearest to.** Corridor shelves, spur shelves and junction aprons all
  overlap; whichever road is nearer owns the ground. Get this wrong and the
  ground under the stage road inherits a branch's grade — a six-meter step
  under the racing line that no test but the shelf assertion will catch.
- **Sample spacing is only APPROXIMATELY `SAMPLE_STEP`.** Each segment
  divides its OWN length into a whole number of steps, so the real spacing is
  per-segment and the slack accumulates along the stage. Anything that has to
  land on a sample AT a given arc position — a gate, a board, a marker the
  player drives past — must SEARCH the samples (monotonic in `s`, so binary
  search: `finishIndex` is the worked example) or carry the index it was
  built with. `Math.round(s / track.step)` put the finish gate four metres
  off the line the clock stops at on a 1.9 km stage, and the error grows with
  length. `elevationAt` and the guard/stand helpers divide on purpose: they
  only want "a sample near here", and a metre costs them nothing.
- **`smooth()` is a Hermite fade, not a curve.** Outside `0..1` it turns over
  and runs away. Every call needs `clamp01` around its argument; an unclamped
  one is how stream ends ended up a kilometer off the map.

## Shipping

- Render BOTH pictures at more than one seed and put the images in front of
  the user before shipping. A generator change that looked fine on seed 3 has
  been wrong on the next seed more than once — and one that looked fine on the
  schematic has been wrong in the world more than once.
- Zoom in on the things the whole-stage frame cannot resolve (a junction, a
  bridge, a guarded hairpin) and LOOK at them at a few meters per pixel.
  `--zoom junctions` already does it for junctions; for anything else, pass
  `renderStage` a track whose `bounds` you have narrowed around the feature.
- `docs/track-generator.md` updated if any rule moved (the verbatim list).
- Both `make sim` tables (before/after) in the PR — the `commit` skill's
  contract for generator changes.
- A `.changes/unreleased/` fragment: generator changes are player-visible by
  definition (the stages change).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. Worth
recording here: a tell in a render, a lever that reliably fixes a look
problem, a coupling between a rule number and the handling.
