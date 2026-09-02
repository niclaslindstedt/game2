// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A reading EASED onto a moving one: a first-order lag at a rate the caller
// picks per frame, with one exception — a jump larger than `snap` between two
// readings is a teleport (a respawn, a fresh stage), and is taken where it is
// found rather than flown to. The first reading hangs the follower where it
// is bolted, so nothing eases in from the units' origin.

export type FollowSpec = {
  /** A step this big between two readings is a teleport, in the reading's
   * own units: the follower snaps to it instead of easing. */
  snap: number;
};

/** A reading eased onto a moving one. `rate` is 1/s and may differ from
 * frame to frame — a camera follows the car one way on the ground and
 * another in the air. */
export function createFollow(
  spec: FollowSpec,
): (value: number, rate: number, dt: number) => number {
  let at = Number.NaN;
  return (value, rate, dt) => {
    if (Number.isNaN(at) || Math.abs(value - at) > spec.snap) return (at = value);
    at += (value - at) * Math.min(1, Math.max(0, rate * dt));
    return at;
  };
}
