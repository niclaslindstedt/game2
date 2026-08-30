// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCARS — the places on a stage where this driver has already come
// unstuck, and what they do about them next time round.
//
// Everything else the bot knows it reads off the state in front of it
// (bot.ts). This is the one thing it has to have LIVED to know, and the
// reason it needs it is an absorbing state in the run itself:
//
// A respawn puts the car back at the last split board (R28) with everything
// about it reset — the same metre, the same heading, the same six metres a
// second — and hands it to a driver who is a pure function of that. So a
// crew that goes off at one particular corner drives the identical line back
// to it, leaves the road at the identical metre, gives up eight seconds
// later, and does the whole thing again: fifteen, twenty respawns, and the
// chequered flag arrives without them. Measured on the 25-seed heat sweep,
// eighteen of 525 runs were in one, and half of those never got out.
//
// It also poisons the instruments. A looped run is worth twenty respawns and
// a retirement, and WHICH runs fall into one is decided by nothing more than
// where the field happens to be on the road — so any change to how the grid
// leaves the line re-rolls it, and the retirement column swings 4, 5, 1, 3,
// 0, 5 across variants of one edit that had nothing to do with any of it.
// The loop is the chaos; this module is the fix for both.
//
// The way out is not a bigger reset rule. It is the thing a driver does: you
// do not take the corner that has just ended your run at the same speed the
// second time. So the driver remembers a PLACE and the SPEED they were
// carrying at it, plans that stretch at a fraction of it, and takes another
// slice off every time the same place catches them again — until they get
// through it, or they are crawling through it. No handicap: a driver who has
// been off twice at a blind right is genuinely slower through that corner
// for the rest of the stage, and quicker than one who never finishes.
//
// DETERMINISM. The memory is keyed on the GameState object itself and never
// written to it — the same seed and car still build the same state, drive
// the same line, cut the same scars, and digest the same (simulation_test).
// A WeakMap rather than something the caller threads through because the
// consequence of a caller forgetting to thread it is exactly the bug above,
// silently; there is no way to hold this wrong. It is the idiom bot.ts
// already uses for what a car grips and for what is beside the road.

import type { GameState } from "../game/state.ts";

/** Metres of the APPROACH a scar covers, and metres past the spot itself. A
 * corner is lost on the way in and left at the exit, so the stretch worth
 * driving differently starts a good way before the wheel that dropped off
 * the road: it is the braking point that was wrong, not the apex. */
const BACK = 60;
const ON = 25;

/** What is left of the speed they were carrying, per time the place has had
 * them. A third off is a driver taking a corner seriously; twice is half of
 * what it was; by the fourth they are picking their way through. */
const PACE = 0.7;

/** ...and the speed no scar plans under, m/s. Something that catches a car
 * out at walking pace — a trunk it wedged against, a bank it beached on —
 * would otherwise scar the road with a crawl the run never recovers from.
 * Under any corner the generator can build, so this never says a corner is
 * quicker than the corner plan already thinks it is. */
const CRAWL = 10;

/** The metres of slack the corner plan gives its own braking distance, kept
 * the same here so a scar and a corner are arrived at the same way. */
const SLACK = 10;

/** One place, and what it has cost. */
type Scar = {
  /** The stretch it covers, in arc metres along the road. */
  from: number;
  to: number;
  /** The speed the car was carrying when it left the road here — the number
   * that got them into trouble, kept from the FIRST time. Deepening reads
   * off `offs`, so remembering a slower one too would take the same slice
   * twice and stop the stage being driveable at all. */
  u: number;
  /** How many runs this place has ended. */
  offs: number;
};

/** What one driver has learned about one stage. */
export type Scars = {
  /** Respawns already accounted for — the edge that says a place has just
   * cost a run, without the bot having to be handed events. */
  seen: number;
  /** Where the car last was with the road under it, and how fast. */
  lastOn: number;
  lastU: number;
  list: Scar[];
};

const MEMORY = new WeakMap<GameState, Scars>();

/** What this driver knows about this stage, having first booked whatever the
 * last step did to them.
 *
 * The booking happens BEFORE the on-road position is re-read, and that order
 * is the whole trick: by the time the bot is asked for another input the
 * respawn has already wound `progressS` back to the board, and the place
 * worth remembering is where the run came undone, not where it was put back.
 *
 * A memory made mid-run starts level — it books the respawns already on the
 * clock as seen — so nothing is scarred that this driver has not just
 * driven into. */
export function scarsFor(state: GameState): Scars {
  let scars = MEMORY.get(state);
  if (!scars) {
    scars = { seen: state.stats.respawns, lastOn: state.progressS, lastU: 0, list: [] };
    MEMORY.set(state, scars);
  }
  if (state.stats.respawns > scars.seen) {
    scars.seen = state.stats.respawns;
    cut(scars);
  }
  // Airborne is not "on the road" for this: a car that took off at a crest
  // and came down in the trees was lost at the crest, and that is the place
  // to arrive at slower.
  if (!state.offRoad && !state.car.airborne) {
    scars.lastOn = state.progressS;
    scars.lastU = state.car.u;
  }
  return scars;
}

/** Mark where the run just came undone — or, if this place has done it
 * before, take another slice off what the driver is prepared to arrive at.
 * Deepening rather than stacking is what makes the loop terminate: the same
 * corner cannot keep being a fresh surprise. */
function cut(scars: Scars): void {
  const at = scars.lastOn;
  for (const scar of scars.list) {
    if (at >= scar.from && at <= scar.to) {
      scar.offs += 1;
      return;
    }
  }
  scars.list.push({ from: at - BACK, to: at + ON, u: scars.lastU, offs: 1 });
}

/** The fastest the driver is prepared to be from here to the next place that
 * has had them, m/s — `Infinity` on a stage nothing has gone wrong on yet,
 * which is every stage until it does.
 *
 * Distance-discounted exactly as a corner is (bot.ts): a scar a long way
 * down the road allows full speed now and is braked for on the way in.
 * `braking` is the same estimate of the car's stopping power the corner plan
 * uses, so the two caps are the same kind of number and the plan can simply
 * take whichever is lower. */
export function scarPlan(scars: Scars, state: GameState, braking: number): number {
  if (scars.list.length === 0) return Infinity;
  const here = state.progressS;
  const track = state.track;
  let plan = Infinity;
  for (const scar of scars.list) {
    let distance = scar.from - here;
    if (here > scar.to) {
      // Behind them. On a sprint that is the end of it; on a circuit (R22)
      // the corner that had them last lap is waiting at the end of this one.
      if (!track.circuit) continue;
      distance += track.length;
    } else if (distance < 0) {
      // In it.
      distance = 0;
    }
    const cap = Math.max(CRAWL, scar.u * PACE ** scar.offs);
    const allowed = Math.sqrt(cap * cap + braking * Math.max(0, distance - SLACK));
    if (allowed < plan) plan = allowed;
  }
  return plan;
}
