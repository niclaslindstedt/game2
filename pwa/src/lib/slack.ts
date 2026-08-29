// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A reading hung off a moving one through a bit of PLAY.
//
// Inside the play the output barely moves; past it the linkage is tight and
// it moves one for one, offset by the play. That is a different filter from
// an ease: an ease separates by TIME and lets everything through eventually,
// while this separates by SIZE — anything smaller than the play is rejected
// outright, however long it is held, and anything bigger arrives at full
// amplitude and only ever late by the play itself. It is also unconditionally
// bounded, which is what makes it safe across a teleport: the output can never
// be further than the play from the truth, so there is no jump to catch.

export type SlackSpec = {
  /** How much play the linkage has, in the reading's own units. */
  reach: number;
  /** How much of the play the linkage takes back per second. */
  recover: number;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A reading hung off a moving one. The first value is taken where it is
 * found — a linkage starts hung on the thing it is bolted to, not on whatever
 * the units' origin happens to be. */
export function createSlack(spec: SlackSpec): (value: number, dt: number) => number {
  let datum = 0;
  let hung = false;
  return (value, dt) => {
    if (!hung) {
      datum = value;
      hung = true;
    }
    datum += (value - datum) * clamp(spec.recover * dt, 0, 1);
    return (datum = clamp(datum, value - spec.reach, value + spec.reach));
  };
}
