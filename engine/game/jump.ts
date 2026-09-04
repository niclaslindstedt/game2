// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW BIG A JUMP IS.
//
// A lip is a boolean on a track sample: the road runs out, and past it the
// car is a projectile. That is enough to know a jump is THERE and nothing
// like enough to CALL one. Two lips on the same stage can be a skip the
// springs swallow and fifty metres of daylight, and a co-driver who says
// "JUMP" to both has told the driver nothing they can act on — which is the
// one thing a call is for.
//
// What separates them is the ramp's GRADE where the road runs out. That,
// times the square of the speed the lip is met at, is the flight; and
// whatever the road does past the lip is added to it, because a landing
// that falls away gives the car every metre of the fall as extra air. Both
// are stage geometry — known when the stage is compiled, and unchanged by
// anything the driver does — so how big a jump is is a fact about the road,
// and it is stated here once for everything that has to say so.
//
// The SPEED is deliberately not part of it. A tier that answered to the
// car's own pace would argue with itself: lift for a big jump and it
// becomes a medium one, so the reason for the lift disappears at the moment
// the lift works, and the call flickers between two words on the brakes.
// Every lip is measured at one reference pace instead, which makes the tier
// what a corner's severity already is — a property of the road that the
// driver answers to, rather than one that answers to the driver.

import type { Track } from "../mapgen/compile.ts";
import { flatTrack } from "../mapgen/flat.ts";
import { slopeAt } from "./track.ts";

const GRAVITY = 9.81;

/** The pace a lip is SIZED at, m/s (~133 km/h). R6 puts every lip on a
 * straight with a run-up in front of it, and the generator's own speed
 * profile (`engine/analysis/speed.ts`) says a car is doing 33-44 m/s at one
 * across the sweep, with the median at 37 — this is that median.
 *
 * Its exact value only fixes the units the thresholds below are written in:
 * the flight scales with the square of it, so any reference speed at all
 * ranks a stage's lips in the same order. It is the median so that the
 * metres in `SIZE_AT` are metres a driver actually flies. */
const REFERENCE_SPEED = 37;

/** How far a flight is followed before the lip is simply enormous, m. */
const MAX_FLIGHT = 200;

/** How big a lip is, in the three words the co-driver has for it.
 *
 *   small  — the springs take it; the call is a heads-up, not an instruction
 *   medium — the car flies, and lands where it is pointed if it is straight
 *   big    — enough air to arrive somewhere the driver did not choose */
export type JumpSize = "small" | "medium" | "big";

/** Flight lengths that separate the three, m at `REFERENCE_SPEED`.
 *
 * Drawn off the stages the generator actually builds rather than picked:
 * over 193 lips (seeds 1-20, all three lengths, the challenge dial at each
 * of its ends) the flight at the reference pace runs 34-77 m with the
 * middle half between 48 and 60. Those two quartiles are these two lines,
 * which puts about a quarter of the game's lips in each of the outer words
 * and half in the plain one — so "BIG" is rare enough to mean something
 * when it comes up, and the ordinary jump is not shouted about.
 *
 * In time rather than metres — which is what the driver spends — they are
 * roughly 1.3 s and 1.6 s of air: under the first the car is down before it
 * has finished leaving, over the second it is a passenger long enough for
 * the road to have changed its mind. */
const SIZE_AT = { medium: 48, big: 60 };

/** How far along the stage a car leaving `lipIndex` at `speed` travels
 * before the ground is back under it, m.
 *
 * Plain ballistics off the ramp's own grade, walked against the road's
 * elevation profile rather than the terrain: R6 guarantees a straight
 * either side of a lip, so for the length of a flight the road IS the line
 * the car is on. Past that the two part company, and where a very long one
 * actually comes down is `engine/analysis/jumps.ts`'s question — it walks
 * world space with the terrain under it, and it is asking whether the stage
 * is fair rather than what to call it. */
export function jumpFlight(track: Track, lipIndex: number, speed: number): number {
  const flat = flatTrack(track);
  const last = flat.arc.length - 1;
  const pitch = Math.atan(slopeAt(track, lipIndex));
  const vy = speed * Math.sin(pitch);
  // A lip met at a crawl still leaves the ground; the horizontal divisor is
  // held off zero so the walk below cannot divide by a stopped car.
  const vx = Math.max(1, speed * Math.cos(pitch));
  const y0 = flat.elevation[lipIndex];
  const s0 = flat.arc[lipIndex];
  for (let i = lipIndex + 1; i <= last; i++) {
    const run = flat.arc[i] - s0;
    if (run > MAX_FLIGHT) return MAX_FLIGHT;
    const t = run / vx;
    const y = y0 + vy * t - 0.5 * GRAVITY * t * t;
    const ground = flat.elevation[i];
    if (y > ground) continue;
    // Touchdown is between this sample and the one before it: the car was
    // above the road there and is below it here. Split the step by how much
    // of the gap each end closed, so a two-metre sample step does not
    // quantize every flight on the stage to the same handful of lengths.
    const prevRun = flat.arc[i - 1] - s0;
    const prevT = prevRun / vx;
    const prevGap = y0 + vy * prevT - 0.5 * GRAVITY * prevT * prevT - flat.elevation[i - 1];
    const gap = ground - y;
    return prevRun + (run - prevRun) * (prevGap / Math.max(1e-6, prevGap + gap));
  }
  return flat.arc[last] - s0;
}

/** Which of the three words `lipIndex` earns. */
export function jumpSize(track: Track, lipIndex: number): JumpSize {
  const flight = jumpFlight(track, lipIndex, REFERENCE_SPEED);
  if (flight >= SIZE_AT.big) return "big";
  if (flight >= SIZE_AT.medium) return "medium";
  return "small";
}
