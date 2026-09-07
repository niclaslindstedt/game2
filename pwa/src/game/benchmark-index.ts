// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INDEX — the benchmark's time, turned into a number that compares —
// and the two lines the card draws it as.
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
//
// THE SECOND LINE IS THE OPPOSITE READING, and it is there because the
// first one HIDES things by construction. A running average is a memory: by
// the end of a run it is eighteen hundred frames deep, and a stretch that
// halves the frame rate moves it by a few points and never says where. So
// beside it goes the SNAPSHOT — the rate the one frame at that reading was
// drawn at, remembering nothing, deliberately unsmoothed. Whatever the
// machine did at second nineteen is at second nineteen on that line, at its
// full depth, and the average is then visibly the thing it drags down.
//
// THE TWO LINES SHARE A BOX, because they are one quantity in two units. An
// index IS a frame rate: `INDEX_REAL * step` per frame a second, so at the
// shipped sixtieth 100 index is 60 fps and neither line needs a scale of
// its own. What the second axis on the right buys is not a second geometry
// but a second LABEL — the same ceiling read in the unit people actually
// think in — and, because the two lines are then directly comparable, the
// one reading that matters: where the snapshot sits against the average is
// whether the score is still being earned or is being paid off.

/** The index the machine scores when it draws the race in the time the race
 * takes to drive. Every other number on the scale is relative to this one. */
export const INDEX_REAL = 100;

/** How often a reading is taken, in measured frames. Thirty of them a second
 * of racing — fine enough that a machine which stumbles shows a kink rather
 * than a smooth line, coarse enough that redrawing the card is nothing
 * against the frames it sits over. */
export const SAMPLE_EVERY = 15;

/** One reading: the run's score by that frame, and the rate of the frame
 * itself. */
export type BenchSample = {
  /** Measured frames drawn when the reading was taken. */
  frame: number;
  /** The whole run so far, scored. */
  index: number;
  /** Frames a second THAT ONE FRAME was drawn at — one over how long it
   * took, and nothing else averaged in. A reading and not a trend: the
   * `index` beside it is already the trend. */
  fps: number;
};

/** Seconds of racing drawn, over seconds of wall clock spent drawing them,
 * on the 100-is-real-time scale. Zero before there is anything to divide —
 * a machine cannot have a score before it has drawn a frame. */
export function benchIndex(racing: number, wall: number): number {
  if (!(wall > 0) || !(racing > 0)) return 0;
  return (INDEX_REAL * racing) / wall;
}

/** The same measurement in the other unit. A run advances the game by
 * `step` seconds per frame, so a machine at `fps` is drawing `step * fps`
 * seconds of racing every second — an index of `INDEX_REAL` times that.
 * Exact, not an approximation: the two are one number in two hats, which is
 * what lets both lines be drawn against one axis. */
export function indexOfFps(fps: number, step: number): number {
  return INDEX_REAL * step * fps;
}

/** …and back. `INDEX_REAL` is `1 / step` frames a second — sixty at the
 * shipped sixtieth, which is what makes the real-time rule a gradation on
 * both scales at once. */
export function fpsOfIndex(index: number, step: number): number {
  if (!(step > 0)) return 0;
  return index / (INDEX_REAL * step);
}

/** Headroom the axis keeps above the score, so the line has somewhere to go
 * and never draws along the ceiling. */
const HEADROOM = 50;

/** …quantised to this. An axis top that tracked the score exactly would
 * rescale on every reading, and the whole line would breathe every half
 * second while saying nothing had changed. Rounding up to a step means the
 * axis holds still through the small drift that is all a converging average
 * does, and moves once when the score has actually gone somewhere.
 *
 * A multiple of five, so the RIGHT-hand axis lands on a whole number of
 * frames a second as well: a step of 25 index is one of 15 fps at the
 * shipped sixtieth, and an axis labelled 105 on one side and 174.6 on the
 * other is an axis nobody reads twice. */
const AXIS_STEP = 25;

/** The lines, ready to draw: everything in a unit box, so the card owns the
 * pixels and this owns the arithmetic. */
export type BenchPlot = {
  /** The index at the top of the LEFT axis. The floor is always 0. */
  top: number;
  /** The same ceiling in frames a second — the right-hand axis, which is a
   * relabelling of the one box rather than a second geometry. */
  topFps: number;
  /** The score line: the run so far, at every reading. `x` runs 0 (the
   * green) to 1 (the last frame of the run); `y` is 0 at the TOP of the box
   * and 1 on the floor, which is the direction a screen measures in and
   * saves the caller a subtraction. */
  points: { x: number; y: number }[];
  /** The snapshot line, in the same box and the same units — every reading's
   * own frame, converted onto the index scale so the two can be read against
   * each other. */
  rate: { x: number; y: number }[];
  /** Where real time sits in the same box, or null when the axis does not
   * reach it — a machine slower than the race it is drawing has no business
   * being told where 100 would have been. */
  real: number | null;
  /** The score at the leading edge: the run so far, which on the last
   * reading is the run. */
  index: number;
  /** …and the rate of the frame that reading was taken on. */
  fps: number;
};

/** Fit the readings to the box. `frames` is the whole run's length, so the
 * x axis is the RUN and not the readings — a line a third of the way across
 * is a run a third of the way through. `step` is what one frame advances
 * the game by, which is the whole of what separates the two units. */
export function benchPlot(
  samples: readonly BenchSample[],
  frames: number,
  step: number,
): BenchPlot {
  const last = samples.length > 0 ? samples[samples.length - 1] : null;
  const index = last?.index ?? 0;
  // The axis is sized off the current score, but a line that spiked earlier
  // still has to fit under the ceiling: the first readings of a cold machine
  // are its wildest, and a graph that clips them is a graph that hides the
  // one thing worth looking at. The snapshots are held to the same promise —
  // a stall drawn against the floor is the point of plotting them, and a
  // fast frame drawn against the ceiling would be the average's peak all
  // over again.
  let peak = index;
  for (const s of samples) {
    if (s.index > peak) peak = s.index;
    const rate = indexOfFps(s.fps, step);
    if (rate > peak) peak = rate;
  }
  const top = Math.max(
    AXIS_STEP,
    Math.ceil((index + HEADROOM) / AXIS_STEP) * AXIS_STEP,
    Math.ceil(peak / AXIS_STEP) * AXIS_STEP,
  );
  const span = Math.max(1, frames);
  const at = (frame: number, value: number): { x: number; y: number } => ({
    x: Math.min(1, frame / span),
    y: 1 - Math.min(1, value / top),
  });
  return {
    top,
    topFps: fpsOfIndex(top, step),
    points: samples.map((s) => at(s.frame, s.index)),
    rate: samples.map((s) => at(s.frame, indexOfFps(s.fps, step))),
    real: INDEX_REAL <= top ? 1 - INDEX_REAL / top : null,
    index,
    fps: last?.fps ?? 0,
  };
}
