---
name: mapgen-improvement
description: "Use when improving the STAGE GENERATOR (engine/mapgen/) — the rules engine that builds every stage fresh from its seed. Covers the three-file split (rules.ts data / generate.ts search / compile.ts geometry), the R-rules and where each is stated, the render → LOOK → simulate → judge loop, how to extend the vocabulary with a new feature, and the invariants (determinism, sub-seed rejection, docs sync) that are load-bearing and easy to undo by accident."
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

## The three files, three jobs

| File          | Job                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rules.ts`    | **The rule book.** Every constraint and vocabulary number as DATA: turn radii/angles per severity, straight lengths, feature placement, world bounds, the self-distance floor. Tuning the generator means editing this file.                                                                           |
| `generate.ts` | **The search.** Draws candidate segments from the seeded RNG, validates each against the rules, retries bounded, backtracks when boxed in, and rejects a whole attempt (retrying with a derived sub-seed) rather than ever shipping a violation. `generateStage(seed)` is a pure function of the seed. |
| `compile.ts`  | **The geometry.** Turns the segment plan into evenly spaced samples (position, heading, elevation, surface, curvature, lips) — the single geometric truth read by the physics, the renderer, and the bots alike.                                                                                       |

Keep the split: a placement decision in `compile.ts`, or a geometric fudge in
`generate.ts`, is how this module rots. Rules are data; the search enforces
them; the compiler only realizes what the search already validated.

## The R-rules live in THREE places — keep them agreeing

The rules are stated in prose in the header of `rules.ts`, listed **verbatim**
in `docs/track-generator.md` (that page's sync obligation is in `AGENTS.md`),
and asserted across seeds in `tests/mapgen_test.ts`. R1–R11 today: opening and
closing straights, the two turn severities, braking zones before hard turns,
the same-direction cap, jump/ford/crest placement, world bounds, no
self-crossing, the length band. A rule changed in one place and not the other
two is worse than no rule — the tests then pin yesterday's reality and the doc
describes a generator that doesn't exist.

## The loop

Everything here is invisible until somebody looks at it. A stage that
validates and passes every test can still read as a noodle, so **the render
and the sim are the units of judgement, not the plan JSON.**

1. **Render:**

   ```sh
   make track                        # previews/track-1..6.png
   npm run track -- --seeds 42,99    # specific seeds
   npm run track -- --count 12       # a wider look
   ```

   Top-down maps: gravel road, red jump lips, blue fords, yellow crests,
   green start, black finish, plus a per-stage stat line.

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

## Extending the vocabulary

A new stage ingredient (say, tunnels or bridges) follows the settled pattern,
in order:

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

## Shipping

- Render the previews at more than one seed and put the images in front of
  the user before shipping. A generator change that looked fine on seed 3 has
  been wrong on the next seed more than once.
- `docs/track-generator.md` updated if any rule moved (the verbatim list).
- Both `make sim` tables (before/after) in the PR — the `commit` skill's
  contract for generator changes.
- A `.changes/unreleased/` fragment: generator changes are player-visible by
  definition (the stages change).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. Worth
recording here: a tell in a render, a lever that reliably fixes a look
problem, a coupling between a rule number and the handling.
