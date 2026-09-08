// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SANDSTORM — the desert's weather, as a thing that ARRIVES.
//
// Every other weather in this game is a state the stage is in: a stage is
// wet or it is not, and it is that from the start line to the finish. A
// sandstorm is not that shape. A haboob is a FRONT — a wall of lifted sand
// thrown out ahead of a collapsing thunderstorm, a kilometre or more tall,
// travelling at the speed of the outflow that made it. You see it on the
// horizon minutes before it reaches you, it takes you in under a minute,
// and then it is on you and the world is gone.
//
// So the model here is a SCHEDULE rather than a level: fronts crossing the
// country at their own times, each with its own strength, and a run that
// meets however many of them its length puts it in the way of. What the
// dial says is how OFTEN they come — from a country the wind has left
// alone to one where the next wall is always on the horizon.
//
// Every part of it is drawn from the run's own seed, analytically, from the
// clock alone: `sandAt(env, t)` is a pure function of the environment and
// the time, so the same seed brings the same storms back on every replay,
// every rival's trace and every sim digest, and an endless run that has
// been going for an hour can be asked about its next front without anybody
// having kept a list. It costs two hashes and no state.
//
// What a storm DOES is deliberately in three places rather than one,
// because the three are what make it hard to drive rather than merely
// hard to see:
//
//   - THE WIND, which is the engine's own (`blowWind` in step.ts): the mean
//     is carried up to the front's own under it, so a storm at full
//     strength blows at the speeds a real haboob does, and everything
//     already reading the wind — the push down the straight, the carry in
//     the air, the sheet on the glass, the road's voice — moves with it for
//     free.
//   - THE CAR, in `car.ts`: a crosswind on a body this tall is a YAW as
//     well as a shove, and holding a line across one is a correction the
//     player has to make. Sand ON the road is grip the tyres do not have.
//   - THE AIR, which is the renderer's: what is left of the visibility, and
//     the wall itself coming.
//
// DOM-free and renderer-free like the rest of `engine/game/`: this module
// says what the storm IS, and the three readers above decide what that is
// worth to them.

import { TUNING as T } from "./defs/tuning.ts";
import type { RaceEnv } from "./state.ts";

/** THE STORM AT ONE MOMENT. Written into a caller-owned record rather than
 * returned, because the readers run 120 times a second and already have
 * one — the same reason `blowWind` writes rather than returns. */
export type SandState = {
  /** HOW MUCH SAND IS IN THE AIR, 0 (clear) to 1 (the core of the front).
   * What the wind, the grip and the visibility are all scaled off. */
  sand: number;
  /** HOW CLOSE THE WALL IS, 0 (nothing on the horizon) to 1 (it is here).
   * It runs up through the whole approach — the minutes when the storm is
   * a brown line under the sky and the light is going yellow — and then
   * stays at 1 for as long as `sand` is above nothing. Two numbers rather
   * than one because they are different questions: `sand` is what is in
   * the air HERE, and this is what is COMING, which is the half a player
   * needs to see in time to do anything about it. */
  approach: number;
};

/** A fresh, calm reading — what a country the wind never picks up is in,
 * and the record the readers start from. */
export function calmSand(): SandState {
  return { sand: 0, approach: 0 };
}

/** Deterministic hash of one front's index, 0..1. Its own little generator
 * rather than the run's RNG: the schedule has to be answerable at any `t`
 * in any order, and a stream cannot do that. */
function frontHash(seed: number, index: number, salt: number): number {
  let h = (seed ^ (index * 0x9e3779b1) ^ (salt * 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x2545f491) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(v: number): number {
  const t = v < 0 ? 0 : v > 1 ? 1 : v;
  return t * t * (3 - 2 * t);
}

/** HOW OFTEN THE FRONTS COME, s between one wall and the next, at this
 * position of the dial — or `null` where they never do. Read here rather
 * than at the call sites so the dial's shape is stated once.
 *
 * Geometric across the band rather than linear, for the reason the
 * ALTITUDE dial is: the band spans an order of magnitude, and read
 * linearly the whole of the stormy end would live in the last tenth of the
 * thumb's travel. */
export function sandPeriodOf(env: Pick<RaceEnv, "sandstorms" | "sand">): number | null {
  if (!env.sand || env.sandstorms <= 0) return null;
  const { calm, often } = T.sand.period;
  return calm * Math.pow(often / calm, env.sandstorms);
}

/** THE STORM AT TIME `t`, written into `into`.
 *
 * The front's own profile is the shape the research describes and nothing
 * more decorative than that: an APPROACH the wall is visible across, a
 * short violent FRONT as the leading edge passes, a CORE at full strength,
 * and a long TAIL as the sand settles out of the air. It is asymmetric on
 * purpose — a haboob does not fade in, it hits — and the asymmetry is the
 * whole character of the thing.
 *
 * Only the three fronts nearest `t` are considered, because a front is far
 * shorter than the gap between two and no fourth can reach.
 */
export function sandAt(env: RaceEnv, t: number, into: SandState): void {
  into.sand = 0;
  into.approach = 0;
  const period = sandPeriodOf(env);
  if (period === null) return;
  const S = T.sand;
  const here = Math.floor(t / period);
  for (let k = here - 1; k <= here + 1; k++) {
    // Each front stands somewhere inside its own slot rather than on the
    // tick of it: a storm every four minutes exactly is a metronome, and
    // the player learns to count instead of to look.
    const arrival = (k + S.jitter * frontHash(env.sandSeed, k, 1)) * period;
    // ...and each has its own strength. The band never reaches zero at the
    // bottom: a front that arrives as nothing is a schedule slot the player
    // watched the horizon for and got nothing out of.
    const peak = S.strength.min + (S.strength.max - S.strength.min) * frontHash(env.sandSeed, k, 2);
    const u = t - arrival;
    if (u < -S.approach || u > S.front + S.core + S.tail) continue;
    if (u < 0) {
      // Still coming. Nothing in the air here yet; the wall is on the
      // horizon and getting closer.
      into.approach = Math.max(into.approach, smoothstep(1 + u / S.approach));
      continue;
    }
    into.approach = 1;
    const sand =
      u < S.front
        ? peak * smoothstep(u / S.front)
        : u < S.front + S.core
          ? peak
          : peak * (1 - smoothstep((u - S.front - S.core) / S.tail));
    if (sand > into.sand) into.sand = sand;
  }
}

/** WHAT THE STORM DOES TO THE WIND: the mean speed the air is blowing at,
 * m/s, with the front's own wind blended in.
 *
 * A BLEND toward the front's wind rather than a multiple of the stage's
 * own, because a haboob brings its wind with it: the outflow that lifted
 * the sand is the wind, and it blows at the speed it blows at whether the
 * afternoon before it was still or already half a gale. Multiplying
 * instead would leave a storm on a calm clear day blowing at nothing,
 * which is the one thing a wall of sand a kilometre tall is not. */
export function sandWindSpeed(mean: number, sand: number): number {
  return sand <= 0 ? mean : mean + sand * Math.max(0, T.sand.wind - mean);
}

/** WHAT IS LEFT OF THE VISIBILITY, 0 (the air is gone) to 1 (clear) — the
 * one number the renderer's fog, the sky's colour and the co-driver's
 * usefulness are all scaled off. Not a linear read of the sand: visibility
 * in blowing dust collapses far faster than the dust concentration rises,
 * which is why a storm goes from "there is a haze" to "there is nothing"
 * in the seconds it takes the wall to pass over. */
export function sandVisibility(sand: number): number {
  if (sand <= 0) return 1;
  const worst = T.sand.visibility;
  return Math.max(worst, Math.pow(1 - sand, T.sand.visionFall) * (1 - worst) + worst);
}
