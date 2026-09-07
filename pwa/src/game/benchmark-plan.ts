// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE BENCHMARK RUNS — the plan, as data.
//
// Its own module because it is a TABLE and the thing that reads it is a
// render loop: benchmark.ts reaches for a canvas and a WebGL context, and
// this has to be readable without either — by the card that reports a run
// (menu-dev.tsx), by the app that stands the stage up (App.tsx), and above
// all by the tests, which run on plain Node with no DOM in their type
// graph and which are where the choices below are actually held to
// something.
//
// Every field here is PINNED rather than read off the player, and each one
// says why in its own comment. The one thing deliberately left alone is
// OPTIONS ▸ VIDEO: the whole use of the tool is running it twice with one
// row moved, so the rows have to be free — which in turn is what obliges
// the stage and the clock below to be stages and clocks where every row
// can actually show.

import type { Difficulty, GearboxMode } from "@engine";

import type { FieldPlan } from "./standings.ts";
import type { PlayCamera } from "./settings.ts";

/** WHAT THE BENCHMARK RUNS. Every one of these is pinned rather than read
 * off the player's own settings: a measurement that moved with whichever car
 * somebody last drove, or whichever gearbox they prefer, would be a number
 * that only compares to itself. The one thing deliberately left alone is
 * OPTIONS ▸ VIDEO — the whole point of running this twice is to find out
 * what a resolution or a draw distance costs. */
export type BenchmarkPlan = {
  /** THE STAGE, and it is chosen rather than convenient: it has to be one
   * where every row of OPTIONS ▸ VIDEO can move the number, or the tool
   * cannot answer the question anybody runs it to ask.
   *
   * The campaign's first stage — short, open, on every install — was the
   * obvious pick and the wrong one. Metered headlessly at the fog's two
   * ends (draw calls a frame at DISTANCE NEAR vs FAR, bot driving, same
   * stage time):
   *
   *   taiga-1  Loggers' Run     203 → 229   +13%
   *   desert-1 Bajada           174 → 183    +5%
   *   desert-2 Creosote Flats   222 → 365   +64%
   *
   * On a tree-lined sprint the whole row is worth 13% of what is submitted,
   * which disappears under the ten per cent two runs of the same build
   * differ by — so a player could walk DISTANCE end to end and read the
   * same score three times, and conclude the row does nothing. It is not
   * that the row does nothing; it is that a stage with nothing far away to
   * cull cannot show it. An OPEN stage is not the answer either, and
   * Bajada is the proof: the flats have long sight lines and almost
   * nothing standing in them, so the fog reaches further and finds less.
   *
   * What is needed is DEPTH WITH THINGS IN IT — a stage that is open enough
   * to see a long way and dense enough that seeing further costs something.
   * Creosote Flats is that, and by a distance: the row is worth two thirds
   * of the frame's draw calls and half its triangles there. */
  levelId: string;
  /** The car the benchmark is driven in. */
  carId: string;
  /** …and its box, which is a different CAR and not a preference: the two
   * modes scale the gear tops and the per-gear drive (`gearedSpec`), and a
   * manual shift costs a cut the auto box does not pay. */
  gearbox: GearboxMode;
  /** The view it is drawn from. The cameras cost different amounts — a
   * cockpit draws an interior, a chase view draws the car and more road — so
   * the benchmark states one instead of inheriting one. */
  camera: PlayCamera;
  /** The field: everybody, on one green, so the cars are ON SCREEN rather
   * than spread a rally interval apart down the road. `createField` clamps
   * the count to what the start apron actually holds, and the result card
   * prints what was standing there. */
  field: FieldPlan;
  /** Seconds of game each rendered frame advances. A sixtieth divides the
   * engine's step exactly (`TUNING.physicsHz`), so a frame is a whole number
   * of steps with nothing left over — the race is the same race every time
   * it is run. */
  step: number;
  /** THE CLOCK THE STAGE STARTS ON, and it is pinned rather than taken from
   * the level for the same reason the stage itself is chosen: a row of
   * OPTIONS ▸ VIDEO that cannot move the number is a row the tool cannot
   * report on, and at noon the LIGHTING row is one of them. Its expensive
   * half is the BEAMS, and a car in daylight has none lit — so the whole
   * ladder from one headlamp to four costs the same nothing, and a player
   * walking it reads the same score three times.
   *
   * So it is pinned where the beams are not only lit but FULLY lit: under
   * `LAMPS_UNDER.main` (daylight.ts), where the driving lamps and the pod
   * bar burn beside the low beams. That is the stop the LIGHTING row can
   * actually be read through — on dipped beams a car throws its low beams
   * alone, so the top two rungs of the head-beam ladder would light the
   * same two lamps and score the same.
   *
   * ONE MINUTE OF RACING IS ONE HOUR OF SUN (`SUN_SECONDS_PER_HOUR`), so
   * this is the start of a band and not a point: the warm-up and the
   * measured thirty seconds carry the sun from about -1.9 to about -7.6
   * degrees. THE WHOLE OF IT IS ON MAIN BEAM, which is the one thing about
   * the hour that may not change under the stopwatch — a stop crossed
   * mid-run is a car that was throwing four beams and is now throwing two,
   * which is the workload moving while it is being measured.
   *
   * It runs past civil twilight at the end and that costs nothing: the
   * daylight WORD is all that changes there (`NIGHT_BELOW`), and nothing
   * culls or skips on it, so every lever that draws world still has exactly
   * the same world to draw. What a dark sky does change is the picture the
   * player watches while it runs, which is why the band is pinned at the
   * light end of main beam rather than in the middle of the night. */
  hour: number;
  /** Frames MEASURED, after the warm-up. Thirty seconds of racing at the
   * step above: long enough to cover the grid, the run to the first corner
   * and a real stretch of stage, short enough that the machine being
   * measured is not tied up for a minute. */
  frames: number;
};

export const BENCHMARK: BenchmarkPlan = {
  levelId: "desert-2",
  carId: "compact",
  gearbox: "auto",
  camera: "chase",
  hour: 18.95,
  field: { difficulty: "medium" as Difficulty, cars: 15, massStart: true, contact: true },
  step: 1 / 60,
  frames: 1800,
};
