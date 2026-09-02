// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A reading carried on a SPRING toward a moving one — a mass, not a lag.
//
// An ease (lib/follow.ts) answers a step in its input with a step in its
// own VELOCITY: the output sets off toward the new value at full tilt in
// the very frame the input moved, and only the distance it has left to
// cover softens over time. That is a first-order filter, and it is what a
// thing with no mass does. A mass on a spring starts from rest: its
// velocity has to be built up by the spring's pull, so a kink in the input
// arrives as a curve, and a bump shorter than the spring's own period is
// mostly never answered at all — the mass has not got going before the
// bump is over. The natural frequency says what counts as a bump and what
// counts as a movement; the damping ratio says whether it overshoots.
//
// Integrated in bounded substeps, because a stiff spring stepped over a
// hitching tab's whole frame rings or runs away, and clamping the step
// instead would make the spring run slow on a weak machine — which turns
// the reading into a frame-rate one.

export type SprungSpec = {
  /** Damping ratio: 1 is critical (arrives without overshooting), under 1
   * overshoots and settles back. */
  damping: number;
  /** A step this big between two readings is a teleport, in the reading's
   * own units: the mass is put down on it, at rest, instead of flying. */
  snap: number;
};

/** Longest step the spring is integrated over, s. */
const SUBSTEP = 1 / 120;

/** A reading carried on a spring. `freq` is the natural frequency in Hz
 * and is taken per call — a camera may hang its height on a soft spring on
 * the ground and a stiff one in the air, with the mass carrying its
 * velocity across the change. `lead` is a velocity the target is known to
 * be moving at, in units per second: a critically damped spring trails a
 * ramp by `2ζv/ω`, and feeding that back in is what lets a mass follow a
 * hill without hanging behind it while still refusing the bump. */
export type Sprung = {
  step: (value: number, freq: number, dt: number, lead?: number) => number;
  /** Let go: the next reading is taken where it is found, at rest — for a
   * follower that has been picked up and put down somewhere else. */
  drop: () => void;
};

export function createSprung(spec: SprungSpec): Sprung {
  let at = Number.NaN;
  let vel = 0;
  return {
    step: (value, freq, dt, lead = 0) => {
      if (Number.isNaN(at) || Math.abs(value - at) > spec.snap) {
        vel = 0;
        return (at = value);
      }
      const w = 2 * Math.PI * freq;
      const damp = 2 * spec.damping * w;
      const target = value + (lead * 2 * spec.damping) / w;
      for (let left = dt; left > 0; left -= SUBSTEP) {
        const h = Math.min(left, SUBSTEP);
        vel += (w * w * (target - at) - damp * vel) * h;
        at += vel * h;
      }
      return at;
    },
    drop: () => {
      at = Number.NaN;
      vel = 0;
    },
  };
}
