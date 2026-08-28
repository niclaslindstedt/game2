// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLASSIFICATION — what "first, second, third" means in a game with no
// other cars on the road.
//
// It means what it means in a real rally: a stage is driven alone against
// the clock, and the result is where your time slots into the start list's.
// So the stage carries a START LIST — a field of crews with times on it —
// and finishing puts you somewhere in it. That is the whole model, and it
// is the honest one for this game: there is nothing to overtake, and a
// placing invented out of a medal threshold would be a medal wearing a
// placing's clothes.
//
// The field is DERIVED, not authored. A rival's time is a multiple of the
// stage's par — the distance at the pace this game's handling actually
// produces — jittered per crew off the stage's own seed. Which means:
//
//   * the same stage always presents the same field, to every player, on
//     every run, so a time that was worth third is worth third tomorrow;
//   * a longer stage's times are longer, without anybody authoring them;
//   * and the field is beatable. The quick end of it sits just under par,
//     so a clean run is a podium and a scruffy one is not — which is what
//     makes the confetti at the finish mean something.
//
// NOTHING SHOWS THE PLACING TO THE PLAYER. It was on the results card and it
// read as a lie — twelve crews on a start list nobody can see is a number the
// player has no way to make sense of — so the card says the time and the board
// says who else has driven it. What is left reading this module is R25's
// finish cannons: how big the salute is IS how good the time was, and that is
// a judgement the derived field can honestly make without ever claiming there
// was somebody to beat. When there are real opponents to place against, this
// is where they go.

import { createRng, finishAt, type Track } from "@engine";

/** R28 — THE SPLITS A CAMPAIGN RUN IS MEASURED AGAINST: the race clock the
 * car it is racing had at each checkpoint. Null while the campaign has
 * nobody on the road — which is today, so the HUD falls back to the ghost.
 *
 * TODO: fill this in when the campaign gets real opponents. The rule is the
 * one every rally broadcast uses: the gap shown is to the LEADER, except
 * when the player IS the leader, where it is to whoever is second — the
 * number a driver needs is always the one that says how much of the stage
 * is theirs to lose. That makes this a function of the opponents' split
 * times, so it takes the field once there is one to take.
 *
 * The field itself belongs here beside `startList`, which is already the
 * derived-opponents module; nothing else in the app needs to change to
 * light the splits up — App.tsx prefers this over the ghost's the moment it
 * returns something. */
export function rivalSplits(_track: Track): number[] | null {
  return null;
}

/** Crews on the start list, INCLUDING the player. Big enough that a placing
 * is a real position rather than a coin toss, small enough to read as a
 * club rally's entry rather than a championship round. */
export const FIELD_SIZE = 12;

/** Par pace, m/s — the pace this game's cars and stages actually produce,
 * measured with `make sim` (~93 km/h across the seeds and the three cars).
 * Everything in the field is a multiple of the time this implies, so the
 * ladder moves with the handling instead of drifting away from it. */
const PAR_PACE = 25.8;

/** The field's spread, as multiples of par time: the quickest crew on the
 * list and the slowest. The fast end is deliberately just UNDER par — the
 * player has to beat the pace the sim says is normal to get on the podium,
 * and beating it comfortably is what wins. */
const SPREAD = { fastest: 0.93, slowest: 1.26 };

/** How much a crew's own time wanders off its slot in that spread, as a
 * fraction of the gap between slots. Under half a slot, so the order of the
 * list still broadly holds while no two stages have the same shape of
 * field. */
const JITTER = 0.42;

/** A stage's result: where the time placed, and out of how many. */
export type Standing = {
  /** 1 is a win. Never below 1, never above `of`. */
  place: number;
  of: number;
  /** The time that would have placed one better, seconds — null when there
   * is nothing better to chase. What a results card shows as the gap. */
  target: number | null;
};

/** The rival times on a stage's start list, quickest first. Deterministic
 * in the seed and the stage's raced length. */
export function startList(track: Track): number[] {
  const raced = finishAt(track) ?? track.length;
  const par = raced / PAR_PACE;
  const rivals = FIELD_SIZE - 1;
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

/** Where `time` places on that list. */
export function classify(track: Track, time: number): Standing {
  const rivals = startList(track);
  let ahead = 0;
  while (ahead < rivals.length && rivals[ahead] < time) ahead += 1;
  return {
    place: ahead + 1,
    of: rivals.length + 1,
    // The next time up the list is the one to chase. A win has nothing
    // above it, which is the one case with no gap to show.
    target: ahead > 0 ? rivals[ahead - 1] : null,
  };
}
