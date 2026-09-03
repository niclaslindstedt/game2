// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A figure that TRAVELS to its new value instead of being replaced by it.
//
// A number that swaps between two frames is a number a player has to notice
// changed; one that counts is a number they watch change, and on the
// pre-race card that is the whole difference between the transmission
// reading as a label and reading as a choice with a consequence. It is the
// same trick every rolling odometer and every arcade score is built on.
//
// DOM-free and frame-free on purpose: this is the maths, the caller owns
// the clock. That is what lets a test ask where the counter stands a
// quarter of the way through without a browser, and what keeps the easing
// out of the component that draws it.

/** How long a figure takes to reach its new value, seconds. Long enough to
 * be a count rather than a flicker, short enough that a player rowing
 * through the cars is never reading a number on its way somewhere. */
export const COUNT_SECONDS = 0.42;

/** Where a counter stands `at` seconds into a run from `from` to `to`.
 *
 * Cubic ease-out: the figure leaves at once and settles, so the movement is
 * unmistakable at the press and the last digits — the ones actually worth
 * reading — are the slowest. Past the run's length it is simply the target,
 * which is what makes this safe to call on any clock without the caller
 * having to stop asking. */
export function countAt(from: number, to: number, at: number, over = COUNT_SECONDS): number {
  if (over <= 0 || at >= over) return to;
  if (at <= 0) return from;
  return from + (to - from) * (1 - (1 - at / over) ** 3);
}
