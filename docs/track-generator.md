# The track generator

Stages are built by a rules engine (`engine/mapgen/`), not authored by hand. The design splits into three files with three jobs:

- **`rules.ts` — the rule book.** Every constraint and every vocabulary number lives here as data: what a soft or hard turn may be, how long straights run, where jumps, fords, and crests may sit, the world bounds, the self-distance floor. Tuning the generator means editing this file.
- **`generate.ts` — the search.** Draws candidate segments from the seeded RNG, validates each against the rules, retries a bounded number of times, backtracks when boxed in, and rejects a whole attempt (retrying with a derived sub-seed) rather than ever shipping a violation. `generateStage(seed)` is a pure function of the seed.
- **`compile.ts` — the geometry.** Turns the segment plan into evenly spaced samples (position, heading, elevation, surface, curvature, jump lips) — the single geometric truth read by the physics, the renderer, and the bots alike.

## The R-rules

The generator respects rally reality. Verbatim from the rule book, each enforced in the search and asserted across seeds in `tests/mapgen_test.ts`:

- **R1** A stage opens with a straight — a start grid plus room to build speed.
- **R2** A stage closes with a straight — a visible finish, no blind final turn.
- **R3** Turns come in two severities with distinct radius/angle vocabularies: soft (fast, open) and hard (slow, tight — up to hairpin).
- **R4** A hard turn only follows a straight: there is always a braking zone.
- **R5** At most two consecutive same-direction turns — no endless spirals.
- **R6** Jumps sit on straights, with a clear run-up before the lip and a landing zone after it; jumps keep a minimum spacing between lips.
- **R7** Water (a ford) sits on straights only, never in the landing zone of a jump, and never on the opening or closing straight.
- **R8** Crests (blind brows) sit on straights and never combine with a jump or a ford on the same segment.
- **R9** The whole centerline stays inside the world bounds; when the stage nears the boundary the generator must turn back toward the middle.
- **R10** The centerline never crosses itself — non-adjacent parts of the stage keep a minimum distance between them (measured per candidate point beyond an 80 m route-neighbour window, so hairpins stay legal and folds stay impossible).
- **R11** Total stage length lands inside the mandated band (~1.6–2.6 km).

## Determinism and the daily stage

`generateStage(seed)` → `compileTrack(seed)` is deterministic end to end: the same seed always builds the same stage, on every device. The app seeds from the day number, so everyone drives the same stage today; each finish advances to the next seed. Seeds are also the bug-report currency (the HUD shows the stage seed).

## Looking at the output

```sh
make track                       # previews/track-1..6.png
npm run track -- --seeds 42,99   # specific seeds
```

renders top-down maps (gravel road, red lips, blue fords, yellow crests, green start, black finish) with a per-stage stat line. Pair with `make sim` — a rules change must keep bots finishing (see [simulation.md](simulation.md)).

## Extending the vocabulary

New content kinds (say, tunnels or bridges) follow the pattern: a feature enum value + placement rules in `rules.ts`, placement logic in `assignFeature`, geometry in `compile.ts`, an R-rule stated in prose in both files and this document, and an invariant test in `tests/mapgen_test.ts`. The renderer picks the feature up from the samples.
