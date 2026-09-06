// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MASS-START GRID — a heads-up race's start line, and the only catch-up
// in the game.
//
// A rally stage is driven alone: the cars leave one at a time, everybody
// drives the same road against the clock, and the classification is a list
// of times (rivals.ts). A HEADS-UP race is the other discipline entirely.
// Everybody leaves on the same green, the road ahead is full of cars, and
// the result is who is in front at the line — which means the whole field
// has to be stood somewhere, and no two of them can be stood in the same
// place.
//
// So it is a GRID, and it stands BEHIND THE START GATE, on the apron R24
// already lays there: `STAGE_RULES.startZone.apron` metres of flat dirt road
// extrapolated straight off the first sample, which is exactly the rally
// start's run-up. Every car therefore drives THROUGH the gate at the green,
// nothing is stood up the road on the far side of it, and the apron's length
// is the hard ceiling on how many cars a grid can hold (`GRID_MAX`).
//
// A DEEPER GRID IS A LONGER APRON, and nothing else: `apronForGrid` says how
// much run-up a given field needs and `compileStage` builds the stage with
// it, which is how Roam's opponents slider stands thirty-two cars behind a
// gate the rule book only lays room for sixteen at. The road itself is
// untouched — the same seed is the same stage whoever is on it — so what
// grows is the dirt behind the line and the shelf under it.
//
// It ZIG-ZAGS: one car per row, alternating sides of the centre line, the way
// a kart or club grid is laid out. The cars overlap nose to tail and are kept
// apart across the road instead, which is what a stagger IS — and from the
// back of it the field reads as a queue running away up the road rather than
// as rows of pairs.
//
// THE ORDER IS THE POINT. The slowest crew takes pole and the quickest one
// starts on the row in front of the player, at the back. Seed it the other
// way — reputation first, as a rally does — and the fast crews simply drive
// away from a field that was never going to catch them, and every race is
// decided before the first corner. This way the road ahead is a queue that
// has to be worked through, by the good bots as much as by the player, and
// the player is behind ALL of it with something to do about it.
//
// THE METRES COME BACK. A row back is metres given away, and the player is
// on the back row, so `TUNING.massStart` hands them back as extra drive over
// the first `catchUpS` metres. Two cars accelerating at a and a(1+k) off the
// same standstill are apart by ½akt², and the leader covers s in
// t = sqrt(2s/a), so by then the trailing car has taken back ½ak(2s/a) = k·s
// metres — independent of a, of the car, and of the surface. A real engine
// tapers rather than pulling flat, so only `catchUpYield` of that reaches the
// road and the gain is scaled by it; the reasoning and the measurements are
// written out on `TUNING.massStart`.
//
// On the default eight-car grid that is 24.5 m of deficit for the back row
// and about 19% more drive for the first two hundred metres, decaying a row
// at a time to nothing at the front. It is not a rubber band: it is spent by
// the first corner, it never looks at who is winning, and it is the ONLY
// assistance a mass start has.

import { TUNING } from "../game/defs/tuning.ts";
import { clamp } from "../lib/math.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import { FIELD_SIZE, enter, entryList, type RivalEntry } from "./rivals.ts";
import { type Difficulty } from "./skill.ts";

const M = TUNING.massStart;

/** The smallest grid worth calling a race. */
export const GRID_MIN = 2;

/** How many cars THE APRON WILL HOLD. The grid stands on the run-up behind
 * the start gate, so the last row has to be inside it with its own bodywork
 * to spare — past the apron's end a car is off the stage entirely
 * (`pastApron` in game/track.ts), which is not a place to start a race from.
 *
 * It is derived rather than chosen: lengthen the apron in the rule book and
 * the grid grows with it, and no number here has to be re-checked by hand.
 * This is the GENERATOR's half of the ceiling, which is why it is separate
 * from `GRID_MAX` — the stage analysis measures the apron against the field
 * a heads-up race wants, and a roster too small to dress that field is a
 * different problem in a different module. */
export const APRON_HOLDS =
  Math.floor((STAGE_RULES.startZone.apron - TUNING.collision.halfLength) / M.rowGap) + 1;

/** …and the largest grid a stage BUILT TO THE RULE BOOK will stand up: never
 * more than that apron holds, and never more than the AUTHORED roster can
 * dress. It is the heads-up race's ceiling and the one the stage analysis
 * measures against, because those are the two that take the stage as the
 * generator built it — and the roster half of it is a choice rather than a
 * limit: a heads-up race is the fourteen crews, not fourteen crews and a
 * club entry to round the number up (`clubCrew`). */
export const GRID_MAX = Math.min(FIELD_SIZE, APRON_HOLDS);

/** …and the largest grid ANYWHERE, once the stage is built for it.
 *
 * Roam's OPPONENTS slider is the only thing that asks: it offers up to
 * thirty-one of them, the stage is compiled with an apron long enough to
 * stand them all on (`apronForGrid`), and the roster is dressed out past
 * fourteen with club entries (`clubCrew`). It is a number the player is
 * choosing their own frame rate with rather than a balanced field — thirty-two
 * cars is thirty-two games stepped every frame and thirty-two bodies drawn —
 * which is why it is Roam's alone and why nothing derives from it. */
export const GRID_CEILING = 32;

/** THE RUN-UP a grid of `cars` needs behind the start gate, m: a row per car
 * and the back one's own bodywork inside the apron's end, since past that a
 * car is off the stage entirely (`pastApron`). Never shorter than the rule
 * book's apron — a two-car grid does not get a two-car start line, it gets
 * the stage's own run-up — so this is what `compileStage` is handed and
 * every stage that enters nobody is built exactly as it always was. */
export function apronForGrid(cars: number): number {
  // R24's start zone is the rule book's apron and no more, so a run-up
  // longer than that is ground the search never kept the route out of. On
  // about one seed in forty the stage comes back past the start inside the
  // extra metres, and the deepest rows of a full grid stand on that piece of
  // road instead of on the apron. It is road either way — nothing falls
  // through and nothing starts off the stage — and buying the alternative
  // would mean the seed drawing a different road for every field size, which
  // is a map that changes under a player moving the opponents slider.

  const rows = Math.max(1, Math.round(cars)) - 1;
  return Math.max(STAGE_RULES.startZone.apron, rows * M.rowGap + TUNING.collision.halfLength);
}

/** The default grid, and also the deepest one on offer. Both numbers above
 * it are DERIVED, so this is whatever the apron and the roster currently
 * allow rather than a figure to quote: today the roster is the binding half
 * and a default heads-up race is the whole entry list on one grid. A shorter
 * one is a menu choice (`GRID_OPTIONS`), and it is the one setting that
 * decides what a heads-up frame costs — every car on it is a body, a plate
 * and a `GameState` stepped beside the player's. */
export const GRID_DEFAULT = GRID_MAX;

/** Where one car stands on the grid, and what standing there costs it. */
export type GridSlot = {
  /** Grid position, 1-based. 1 is pole. */
  number: number;
  /** How far BEHIND the start gate it is stood, meters along the apron. Pole
   * is on the line itself, so nothing is ever placed in front of the gate. */
  back: number;
  /** Meters right of the road's centre — the zig-zag, alternating by row. */
  lateral: number;
  /** Meters this slot is giving away to pole, which is the same number as
   * `back` and is named separately because it is what the catch-up is sized
   * from rather than where the car is put. */
  deficit: number;
  /** Extra drive it takes them back with, as a fraction (TUNING.massStart). */
  gain: number;
};

/** A grid size the game will actually stand up. The ceiling is Roam's
 * (`GRID_CEILING`), not the rule book's apron: whoever asks for a grid
 * deeper than `GRID_MAX` is expected to have built the stage for it, and
 * the two surfaces that have not — the heads-up page and the analysis —
 * hold themselves to `GRID_MAX` where they ask. */
export function gridSize(cars: number): number {
  return clamp(Math.round(cars), GRID_MIN, GRID_CEILING);
}

/** What a slot `deficit` metres down on pole is given back, as a fraction of
 * extra drive. The ideal is `deficit / catchUpS`; `catchUpYield` is the share
 * of that a real car with a tapering engine actually converts into road, and
 * the cap is what a grid too deep to compensate honestly settles for
 * (TUNING.massStart). */
export function catchUpFor(deficit: number): number {
  if (deficit <= 0) return 0;
  return Math.min(M.catchUpMax, deficit / (M.catchUpS * M.catchUpYield));
}

/** THE GRID, front to back — where every slot stands and what it is owed for
 * standing there. Slot 1 is on the start line; slot `cars` is the last one,
 * deepest into the apron, and that is the player's: it is what "starting
 * behind the bots" means here. */
export function massStartGrid(cars: number): GridSlot[] {
  const size = gridSize(cars);
  const slots: GridSlot[] = [];
  for (let i = 0; i < size; i++) {
    // One car per row, alternating sides — right, then left. Pole takes the
    // right, so the odd numbers are always on the same side of the road and
    // a grid reads the same way whatever its size.
    const deficit = i * M.rowGap;
    slots.push({
      number: i + 1,
      back: deficit,
      lateral: (i % 2 === 0 ? 1 : -1) * M.columnOffset,
      deficit,
      gain: catchUpFor(deficit),
    });
  }
  return slots;
}

/** The field for a heads-up race, IN GRID ORDER — pole first, and pole is
 * the SLOWEST crew on it. The player takes the slot the list does not:
 * number `cars`, at the back of the apron.
 *
 * `number` is the grid slot, not a rally start number, and it is what the
 * name plate over each car reads. */
export function headsUpField(difficulty: Difficulty, cars: number): RivalEntry[] {
  // Slowest first, so the grid ahead of the player is a queue that gets
  // harder rather than a train pulling away from them.
  return entryList(gridSize(cars))
    .sort((a, b) => a.standing - b.standing)
    .map((crew, index) => enter(crew, difficulty, index + 1));
}
