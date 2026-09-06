// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INDEX — the benchmark's time, turned into a number that compares.
//
// The run itself is a fixed piece of racing and a stopwatch (benchmark.ts):
// thirty seconds of a scripted race, drawn as fast as the machine will draw
// it, and the answer is how long that took. That is the honest measurement
// and it is a poor SCORE, for the reason every stopwatch is: lower is
// better, the interesting machines are all bunched into the low numbers,
// and nobody can say what twice as fast looks like without doing division
// in their head.
//
// So the time is reported as an index instead, and the point it is pinned
// at is the one point on the scale that means something on its own:
//
//   INDEX 100 IS REAL TIME — the machine draws the race in the time it
//   would take to drive it. 200 is twice that, 400 four times, 50 half.
//
// Which makes it a ratio and not a unit: it is the same number whatever the
// run's length is changed to, higher is better the way a score should be,
// and two of them divide into each other to give the thing anybody actually
// wants to know — this machine is 2.4x that one.
//
// AND IT IS READ WHILE IT RUNS. The same division answers over fifteen
// frames as over eighteen hundred, so the run draws its own score as it
// goes. What is plotted is the score OF THE RUN SO FAR — every frame since
// the green over all the time since the green — rather than the score of
// the last fifteen frames on their own. A window that narrow is mostly
// noise (one compile, one page fault, one other program waking up), and a
// graph of it is a hedge nobody reads; the running answer starts wherever
// the first fifteen frames landed and walks steadily onto the final number,
// which is the LAST point on the line and not a separate calculation.

/** The index the machine scores when it draws the race in the time the race
 * takes to drive. Every other number on the scale is relative to this one. */
export const INDEX_REAL = 100;

/** How often a reading is taken, in measured frames. Thirty of them a second
 * of racing — fine enough that a machine which stumbles shows a kink rather
 * than a smooth line, coarse enough that redrawing the card is nothing
 * against the frames it sits over. */
export const SAMPLE_EVERY = 15;

/** One reading: the index the run had scored by that frame. */
export type BenchSample = {
  /** Measured frames drawn when the reading was taken. */
  frame: number;
  /** The whole run so far, scored. */
  index: number;
};

/** Seconds of racing drawn, over seconds of wall clock spent drawing them,
 * on the 100-is-real-time scale. Zero before there is anything to divide —
 * a machine cannot have a score before it has drawn a frame. */
export function benchIndex(racing: number, wall: number): number {
  if (!(wall > 0) || !(racing > 0)) return 0;
  return (INDEX_REAL * racing) / wall;
}

/** Headroom the axis keeps above the score, so the line has somewhere to go
 * and never draws along the ceiling. */
const HEADROOM = 50;

/** …quantised to this. An axis top that tracked the score exactly would
 * rescale on every reading, and the whole line would breathe every half
 * second while saying nothing had changed. Rounding up to a step means the
 * axis holds still through the small drift that is all a converging average
 * does, and moves once when the score has actually gone somewhere. */
const AXIS_STEP = 25;

/** The line, ready to draw: everything in a unit box, so the card owns the
 * pixels and this owns the arithmetic. */
export type BenchPlot = {
  /** The index at the top of the axis. The floor is always 0. */
  top: number;
  /** The readings. `x` runs 0 (the green) to 1 (the last frame of the run);
   * `y` is 0 at the TOP of the box and 1 on the floor, which is the
   * direction a screen measures in and saves the caller a subtraction. */
  points: { x: number; y: number }[];
  /** Where real time sits in the same box, or null when the axis does not
   * reach it — a machine slower than the race it is drawing has no business
   * being told where 100 would have been. */
  real: number | null;
  /** The score at the leading edge: the run so far, which on the last
   * reading is the run. */
  index: number;
};

/** Fit the readings to the box. `frames` is the whole run's length, so the
 * x axis is the RUN and not the readings — a line a third of the way across
 * is a run a third of the way through. */
export function benchPlot(samples: readonly BenchSample[], frames: number): BenchPlot {
  const index = samples.length > 0 ? samples[samples.length - 1].index : 0;
  // The axis is sized off the current score, but a line that spiked earlier
  // still has to fit under the ceiling: the first readings of a cold machine
  // are its wildest, and a graph that clips them is a graph that hides the
  // one thing worth looking at.
  let peak = index;
  for (const s of samples) if (s.index > peak) peak = s.index;
  const top = Math.max(
    AXIS_STEP,
    Math.ceil((index + HEADROOM) / AXIS_STEP) * AXIS_STEP,
    Math.ceil(peak / AXIS_STEP) * AXIS_STEP,
  );
  const span = Math.max(1, frames);
  const points = samples.map((s) => ({
    x: Math.min(1, s.frame / span),
    y: 1 - Math.min(1, s.index / top),
  }));
  return { top, points, real: INDEX_REAL <= top ? 1 - INDEX_REAL / top : null, index };
}
