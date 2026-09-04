// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CRASH THROWS UP, as numbers — how much ground a body that is no
// longer on its wheels moves, and from WHERE on itself it moves it.
//
// Separate from the renderer that spawns it, for `drift-throw.ts`'s reason:
// this half touches neither three.js nor the DOM, and the interesting part
// of the effect is arithmetic a screenshot cannot measure. A picture can say
// the cloud looks right; only a test can say a body on its roof throws from
// its ROOF rather than from four wheels that are in the air.
//
// The wheel clouds (`dust.ts`, `drift-spray.ts`, `plume.ts`) all spawn at
// the axles, because everything that throws ground on a normal stage is a
// tyre. A car past its outside wheels has no tyre on the ground at all: it
// has a corner of its shell, somewhere round the hull depending on how far
// over it is, and that corner is ploughing. So this answers two questions
// the wheel logic never had to:
//
//   WHERE — `crashContact`, the corner of the hull that is down.
//   HOW MUCH — a BURST for each contact (the chassis slamming in) and a
//   RATE for the grind between them (the body ploughing along on a face).

import { TUNING } from "@engine";

const B = TUNING.collision;

/**
 * THE KNOBS. Grains are particles; puffs are the smoke that comes up with
 * them. Speeds are m/s and slams are the arriving speed the engine's
 * `landing` event carries, both on the engine's own scales.
 */
export const CRASH_THROW = {
  /** THE BURST — a corner of the shell arriving. Grains per m/s of slam,
   * and the ceiling past which more slam only means a harder noise: a
   * contact that throws three hundred stones already fills the frame, and
   * a roll makes a dozen of them. */
  perSlam: 34,
  burstMax: 420,
  /** ...and the HANGING half of the same burst: the part that is left
   * behind rather than flung. The same substance and the same pool — the
   * world is chunky and vertex-coloured, so its dust is more grit thrown
   * slower and higher, never a soft billboard borrowed from the tyre
   * smoke. Fewer than the grains, so a burst reads as STONES with dust
   * behind them rather than as a ball of haze. */
  puffPerSlam: 9,
  puffMax: 130,
  /** Under this much slam a contact is a body settling rather than
   * arriving, and it throws nothing. The same bar the engine uses to
   * decide a contact is an accident at all (`collision.scuffSpeed`). */
  slamFloor: 3,

  /** THE GRIND — a body ploughing along on a face of itself. Per SECOND
   * per m/s of travel, because a cloud's density is a rate and never a
   * per-frame count: a car grinding at 20 m/s is moving a great deal of
   * ground and a car about to stop is moving almost none.
   *
   * THE CEILING IS THE POOL'S, not taste's. The crash has its own
   * (`CRASH_GRIT`, 3072) precisely so this can be big — the wheel clouds
   * share 768 between them and a rollover would have taken all of it — but
   * the arithmetic still binds: a grain lives up to 1.8 s, so the whole
   * cloud at full rate is about `grindMax + grindPuffMax` times that, and
   * a rate past what the pool holds reads as it tearing a hole in itself
   * at the moment it is thickest. Raise the pool with the rate or not at
   * all. */
  grindPerSpeed: 90,
  grindMax: 1250,
  grindPuffPerSpeed: 22,
  grindPuffMax: 320,
  /** Under this the body is coming to rest and the cloud goes with it. */
  grindFrom: 2.5,

  /** HOW IT LEAVES. The grit is thrown BACK along the travel (a share of
   * the body's own speed) and up; the smoke is left behind instead, which
   * is the difference between a stone that was flung and a cloud that was
   * disturbed. */
  kick: 0.5,
  lift: 3.6,
  spread: 6,
  smokeKick: 0.14,
  smokeLift: 2.2,
  smokeSpread: 3.2,

  /** HOW MANY PARTICLES THE CRASH'S OWN CLOUD KEEPS, and how long one
   * lives (s) — stated here rather than beside the rest of the look in
   * `dust.ts` because they are not a look, they are the BOUND on every
   * rate above. The whole cloud at full rate is
   * `(grindMax + grindPuffMax) × life`, and a pool smaller than that has
   * it recycling grains that are still on screen: the cloud tears a hole
   * in itself at the moment it is thickest. `crash_throw_test.ts` holds
   * the three together so a rate cannot be raised without the pool. */
  pool: 3072,
  life: 1.8,

  /** A SPIN is four tyres dragged sideways — the biggest cloud a car makes
   * without going over — and this is what it is worth over the ordinary
   * sliding wheel's throw. */
  spun: 2.2,
} as const;

/** The hull the body rolls on, in its own frame: (across, up) from the
 * wheel contact plane under the middle of the car. The same outline
 * `engine/game/roll.ts` stands on the ground, restated here because the
 * renderer needs the corner's POSITION and the engine only ever needs its
 * height. Two wheel contacts and the four corners of the shell. */
const HULL: readonly (readonly [number, number])[] = [
  [B.halfTrack, 0],
  [-B.halfTrack, 0],
  [B.halfWidth, B.floorY],
  [-B.halfWidth, B.floorY],
  [B.halfWidth, B.roofY],
  [-B.halfWidth, B.roofY],
];

/**
 * WHERE THE BODY IS TOUCHING THE GROUND at this attitude — the corner of
 * the hull that is lowest, as an offset from the car's own origin.
 *
 * `across` is metres along the car's right axis and `up` metres above the
 * origin (negative: the contact is always below the wheel plane once the
 * body is over). Feed it the tilt, not the raw roll — a car that has been
 * over once carries whole turns.
 *
 * It is the whole reason this module exists. A landing already throws from
 * four wheels (`atWheels`), and for a body on its ROOF those four points
 * are a metre and a half in the air with nothing under them: the burst
 * appears above the car, going nowhere, while the part actually ploughing
 * the ground throws nothing at all.
 */
export function crashContact(tilt: number): { across: number; up: number } {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  let low = Infinity;
  let at = { across: 0, up: 0 };
  for (const [across, up] of HULL) {
    // The corner, turned by the roll, in the plane across the car.
    const y = up * cos - across * sin;
    if (y >= low) continue;
    low = y;
    at = { across: across * cos + up * sin, up: y };
  }
  return at;
}

/** WHAT ONE CONTACT THROWS: a corner of the shell arriving at the ground
 * hard enough to matter. `slam` is the arrival speed the `landing` event
 * carries, m/s. Both counts are whole particles, and both are zero for a
 * body merely settling onto a face. */
export function crashBurst(slam: number): { grains: number; puffs: number } {
  const over = slam - CRASH_THROW.slamFloor;
  if (over <= 0) return { grains: 0, puffs: 0 };
  return {
    grains: Math.round(Math.min(CRASH_THROW.burstMax, over * CRASH_THROW.perSlam)),
    puffs: Math.round(Math.min(CRASH_THROW.puffMax, over * CRASH_THROW.puffPerSlam)),
  };
}

/** ...and WHAT THE GRIND THROWS, per second, for a body ploughing along on
 * a face of itself at `speed` m/s. A rate, never a count: the caller owes
 * `rate × dt` and carries the fraction, or the cloud's density becomes the
 * frame rate (the trap `dust.ts` and `fumes.ts` have both been caught by). */
export function crashGrind(speed: number): { grains: number; puffs: number } {
  const over = speed - CRASH_THROW.grindFrom;
  if (over <= 0) return { grains: 0, puffs: 0 };
  return {
    grains: Math.min(CRASH_THROW.grindMax, over * CRASH_THROW.grindPerSpeed),
    puffs: Math.min(CRASH_THROW.grindPuffMax, over * CRASH_THROW.grindPuffPerSpeed),
  };
}
