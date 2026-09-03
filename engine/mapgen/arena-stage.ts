// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAINING GROUND AS A TRACK — the stub of road the arena is reached
// along, and the plan bolted to it.
//
// A run needs a ribbon even when the driving is not on one. The car is put
// on a start line, `locate` wants a centerline to hint from, and a reset has
// to put the car back SOMEWHERE — all of which are questions about a road.
// So the training ground gets one: a hundred metres of gravel approach
// running north into the gate cut in the arena's south bank, and nothing
// else. The moment the car drives off the end of it the whole session is in
// step.ts's wild branch, which is where an arena is driven.
//
// It is deliberately the shortest road that answers those three questions.
// A longer approach would only be road the player has to drive back down
// after every reset.

import { buildArena, ARENA_KNOBS, ARENA_PAD, type ArenaPlan } from "./arena.ts";
import { compileTrack, type Track } from "./compile.ts";
import type { SegmentPlan } from "./rules.ts";

/** How long the approach road is, m. Two lengths of a car and a bit: enough
 * to be stood on, to be pointed down, and to be back on in a second. */
const APPROACH = 100;

/** The seed the training ground's country is built from. It is a level and
 * not a roll: the trees outside the berm are in the same places for every
 * player, every session, forever. */
export const ARENA_SEED = 71903;

/** Build the training ground. Deterministic in the seed the way every stage
 * is, and authored the way none of the others are. */
export function compileArena(seed: number = ARENA_SEED): Track {
  const segments: SegmentPlan[] = [{ kind: "straight", length: APPROACH, feature: "none" }];
  const track = compileTrack(seed, segments, ARENA_KNOBS);
  track.arena = arenaOn(track);
  return track;
}

/** Stand the arena on the end of the approach: its south rim exactly where
 * the road runs out, square with it, so the gate in the bank is the road's
 * own continuation rather than a turn onto the pad. */
function arenaOn(track: Track): ArenaPlan {
  const last = track.samples[track.samples.length - 1];
  // The pad's middle is half a pad up the road's own heading, which puts
  // its south rim on the last sample.
  return buildArena({
    x: last.x + Math.sin(last.heading) * ARENA_PAD,
    z: last.z + Math.cos(last.heading) * ARENA_PAD,
    heading: last.heading,
  });
}
