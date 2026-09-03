// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLASSIFICATION, as a FRAME sees it.
//
// The field itself is the engine's (`engine/sim/field.ts`): who is entered,
// how the stagger works, how a rival is stepped, and what "first, second,
// third" means once everybody is home. It lives there because a result has
// to be the same result whether it is read off the results card or off a
// recorded run replayed against another difficulty — one field, one
// classification, or the calibration measures nothing.
//
// Two things are left here, and both are things only a frame has an opinion
// about. THE HEAD START HAS TO BE PAID FOR: thirteen intervals of driving is
// about a second of CPU, so it is spent in BUDGETED slices from the moment
// the field is entered — under the establishing shot, which is exactly long
// enough to hide it. And THE DERIVED START LIST at the bottom, which is how
// big R25's salute is on a run with nobody entered.

import { createRng, finishAt, payHeadStart, type RivalField, type Track } from "@engine";

// The field, re-exported: the app reads it through the module it has always
// read it through, and the engine owns what it is.
export {
  PLAYER_ID,
  RALLY_FIELD,
  advanceField,
  advanceRun,
  createField,
  fieldResults,
  fieldTraced,
  livePlace,
  onRoad,
  placeAtFinish,
  placeAtSplit,
  placeField,
  playerSlot,
  rubRivals,
  settleField,
  settleLimit,
  splitLeader,
  stepField,
  stillRunning,
  stopField,
  watchField,
  type ClassRow,
  type FieldPlan,
  type FieldStage,
  type RivalField,
  type RivalRun,
} from "@engine";

/** How long the catch-up may spend per frame, ms. Sized against the beat it
 * runs under: the establishing shot is `TUNING.intro` long, so even a
 * device managing 30 fps has a couple of hundred slices to spend the
 * field's head start in, and nothing the player can see is waiting on it. */
const CATCHUP_MS = 4;

/** Steps taken between two readings of the clock inside the catch-up. Long
 * enough that the timing costs nothing, short enough that the budget is
 * still honoured on a slow device. */
const CATCHUP_GRAIN = 64;

/** Spend a slice of this frame on the head start the field is still owed.
 * Called every frame from the moment the field is entered; a no-op the
 * moment everybody is out of the control. Returns true while there is more
 * to do, which is what the debug overlay reads. */
export function catchUpField(field: RivalField, budgetMs = CATCHUP_MS): boolean {
  const deadline = performance.now() + budgetMs;
  return payHeadStart(field, () => performance.now() < deadline, CATCHUP_GRAIN);
}

/** Pay the WHOLE head start now, however long it takes. The classification
 * cannot be read while a crew is still owed road — their splits and their
 * time are simply missing — so anything that reads it drains what is left
 * rather than placing the player against a field that has not finished
 * driving. */
export function drainField(field: RivalField): void {
  payHeadStart(field);
}

// ── The derived start list ────────────────────────────────────────────────
// For the runs with nobody else entered. A time trial and a Roam stage still
// end with R25's cannons, and how big the salute is IS how good the time was;
// with no field to place against, the honest stand-in is where the time would
// have slotted into a list of times the pace of this stage produces. It is
// derived rather than authored, so it moves with the handling and with the
// stage's length, and it is deterministic in the seed — a time that was worth
// third is worth third tomorrow.

/** Crews on the derived list, INCLUDING the player. */
const PAR_FIELD = 12;

/** Par pace, m/s — the pace this game's cars and stages actually produce,
 * measured with `make sim` (~97 km/h across the seeds and the three cars). */
const PAR_PACE = 25.8;

/** The list's spread, as multiples of par time. The fast end is deliberately
 * just UNDER par: a clean run is a podium and a scruffy one is not. */
const SPREAD = { fastest: 0.93, slowest: 1.26 };

/** How far a crew's own time wanders off its slot, as a fraction of the gap
 * between slots. Under half a slot, so the order still broadly holds. */
const JITTER = 0.42;

/** A stage's result: where the time placed, and out of how many. */
export type Standing = {
  /** 1 is a win. Never below 1, never above `of`. */
  place: number;
  of: number;
};

/** The derived times on a stage, quickest first. */
function parList(track: Track): number[] {
  const raced = finishAt(track) ?? track.length;
  const par = raced / PAR_PACE;
  const rivals = PAR_FIELD - 1;
  // A stream of its own, mixed off the seed: adding a start list must not
  // shift a single number the stage geometry or the physics draws.
  const rng = createRng((track.seed ^ 0x3c6ef372) >>> 0);
  const step = (SPREAD.slowest - SPREAD.fastest) / Math.max(1, rivals - 1);
  const times: number[] = [];
  for (let i = 0; i < rivals; i++) {
    const slot = SPREAD.fastest + step * i;
    times.push(par * (slot + step * rng.range(-JITTER, JITTER)));
  }
  return times.sort((a, b) => a - b);
}

/** Where `time` places on that derived list. */
export function classify(track: Track, time: number): Standing {
  const rivals = parList(track);
  let ahead = 0;
  while (ahead < rivals.length && rivals[ahead] < time) ahead += 1;
  return { place: ahead + 1, of: rivals.length + 1 };
}
