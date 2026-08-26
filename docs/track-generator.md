# The track generator

Stages are built by a rules engine (`engine/mapgen/`), not authored by hand. The design splits into three files with three jobs:

- **`rules.ts` — the rule book.** Every constraint and every vocabulary number lives here as data: what a soft, medium, or hard turn may be, how long straights run, where jumps, fords, and crests may sit, the length bands and their world bounds, the self-distance floor. Tuning the generator means editing this file.
- **`generate.ts` — the search.** Draws candidate segments from the seeded RNG, validates each against the rules, retries a bounded number of times, backtracks when boxed in, and rejects a whole attempt (retrying with a derived sub-seed) rather than ever shipping a violation. `generateStage(seed, length)` is a pure function of its inputs. `createStageStream(seed)` is the endless variant: the same vocabulary, streamed forever.
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
- **R10** The centerline never crosses itself — non-adjacent parts of the stage keep a minimum distance between them (measured per candidate point beyond an 80 m route-neighbour window, so hairpins stay legal and folds stay impossible). On an endless stage the guarantee covers the trailing `endless.tailWindow` meters — road further back is long gone behind the car and out of sight.
- **R11** Total stage length lands inside the selected stage length's band.
- **R12** A ford sits in a dip: the road eases down to FLAT water and climbs back out. Water never stands on a rise — it collects at a local low point, fed by the stream that crosses the road there.

## Stage lengths

The pre-race menu picks a length; each finite one maps to a band in `STAGE_RULES.stageLengths`, sized from the sim's measured bot pace so the minutes come out roughly true, with a world that grows with the band:

| Menu       | Target  | Band         |
| ---------- | ------- | ------------ |
| Short      | ~1 min  | 1.45–1.8 km  |
| Medium     | ~3 min  | 4.4–5.2 km   |
| Long       | ~5 min  | 7.4–8.4 km   |
| Extra long | ~7 min  | 10.4–11.8 km |
| Endless    | forever | streamed     |

## The endless stage

`compileStage(seed, "endless")` builds the opening stretch and hands back a track that extends itself: the engine's `step()` keeps `STAGE_RULES.endless.horizon` meters of road materialized ahead of the car, and the renderer streams world chunks and terrain tiles in around it (and drops them behind). Two mechanisms replace the finite search's whole-attempt reject:

- **A course.** The stream is point-to-point: it follows a slowly drifting bearing and keeps the road's heading within an error budget of it, so an endless run reads as a journey rather than a scribble — and the walk never curls back into its own tail.
- **A commit lag.** The search runs `endless.commitLag` meters ahead of the road it hands out; inside that lag it may still backtrack out of a pocket. The freeze boundary follows the generation high-water mark, so what a seed produces is independent of how the extends are chunked — the same seed always streams the same road.

## Pacenotes

The compiler emits one co-driver call per turn — contiguous same-direction turns merge into a single call — carrying direction, the tightest severity in the run, and the summed angle (`track.pacenotes`). The HUD reads them ahead of the car and shows the rally-style calls (EASY/MEDIUM/HARD LEFT/RIGHT, LONG past ~100°); the engine's positive direction reads as a LEFT turn on screen (the rendered world mirrors the engine's map view — the same one-flip rule as steering).

## Rolling elevation

Generated stages are genuinely 3D: under the feature ramps, `compileStage` sums octaves of seeded value NOISE along arc length (`STAGE_RULES.elevation`), each octave half as long and a fraction as tall as the one above it. Noise rather than sine waves because a sine repeats — every rise the same shape as the last — and octaves shorter than a few dozen meters are not hills at all but a washboard: on a road sampled every 2 m they flip the grade back and forth every ripple, which is what the eye actually sees. Per-stage character (how tall, how long, how rough) is drawn from the rule ranges, so one seed rolls and the next is nearly flat. Grades live on the straights and flatten through corners (`straightness` in `compile.ts`) — partly stage-design taste, partly load-bearing: a car cutting inside a turn sweeps whole samples of arc per physics step, and a real grade across that sweep would read as the ground falling away. Fords carve their own dips into the profile (R12): the water lies flat below the lowest surrounding grade, with the approach eased over an apron on each side. Synthetic tracks (`compileTrack(seed, segments)`) stay flat rigs so scripted physics tests measure exactly what they script.

## Determinism and the daily stage

`generateStage(seed, length)` → `compileStage(seed, length)` is deterministic end to end: the same seed always builds the same stage, on every device — endless streams included. The app seeds from the day number, so everyone drives the same stage today; each finish advances to the next seed. Seeds are also the bug-report currency (the HUD shows the stage seed).

## Looking at the output

```sh
make track                                  # previews/track-1..6.png (medium)
npm run track -- --seeds 42,99              # specific seeds
npm run track -- --length xlong             # a stage length band
npm run track -- --length endless --km 8    # a streamed endless stretch
```

renders top-down maps (gravel road, red lips, blue fords, yellow crests, green start, black finish) with a per-stage stat line. Pair with `make sim` (`--length` picks the band) — a rules change must keep bots finishing (see [simulation.md](simulation.md)).

## Extending the vocabulary

New content kinds (say, tunnels or bridges) follow the pattern: a feature enum value + placement rules in `rules.ts`, placement logic in `assignFeature`, geometry in `compile.ts`, an R-rule stated in prose in both files and this document, and an invariant test in `tests/mapgen_test.ts`. The renderer picks the feature up from the samples.
