// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLOCK — the one place in engine/ (beside the output module's
// timestamps) that reads the wall clock.
//
// The simulation never reads it: a run is its seed and its inputs, and a
// clock's value reaching the state or a draw would make two runs of the same
// seed disagree. What does read it is the code that REPORTS on itself — an
// analysis or rating pass saying how many milliseconds it took, a recorded
// tape saying when it was recorded. Those take a `Clock` as a parameter,
// defaulting to `wallClock`, and call `now()` on it; none of them calls
// `Date.now` itself. A test hands in `fixedClock(…)` and gets byte-identical
// reports back, which is what "deterministic" has to mean for a report that
// carries a timing.

/** Milliseconds since the epoch (or any fixed origin — only differences and
 * stamps are ever taken). */
export type Clock = { now(): number };

/** The real clock. The default wherever a clock is taken. */
export const wallClock: Clock = { now: () => Date.now() };

/** The same clock at sub-millisecond resolution (`performance.now()`, whose
 * origin is the process's start rather than the epoch — fine, since only
 * differences are taken from it). For timing a batch of calls that each cost
 * microseconds, where whole milliseconds would read as nothing. */
export const preciseClock: Clock = { now: () => performance.now() };

/** A clock that never moves: every `now()` is `at`. For tests and for any
 * report that must come out the same twice. */
export function fixedClock(at = 0): Clock {
  return { now: () => at };
}
