// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CORNER AS ITS OWN SIGN — the line the co-driver's strip draws is the
// stage's own plan view of the turn being called, walked off the compiled
// centerline.
//
// A fixed arrow per severity is a vocabulary the driver has to learn; the
// corner itself is one they already have, out of the windscreen. A double
// apex, a bend that tightens on the exit and a constant-radius sweep are one
// word on the strip ("HARD LEFT") and three different pictures here, and the
// picture is the half that survives being read at 140 km/h.
//
// What keeps it a SIGN rather than a map is the styling, and all of it is in
// this file: the plan is squared up on the corner's ENTRY, so the road always
// arrives from the bottom of the box whichever way the stage happens to be
// pointing; it is resampled to a handful of points and smoothed, so none of
// the road's own wander reaches the sign; and it is fitted to the box, so
// every call is the same size on screen however many metres of corner it is.
//
// DOM-free — it is geometry, and the tests read it without a browser.

import type { Pacenote, TrackSample } from "@engine";

/** A point in the sign's own 100x100 box — the viewBox the HUD draws in. */
export type PacePoint = [number, number];

/** A whole sign: the road, and the head that says which way it goes. */
export type PaceSign = {
  /** The corner, as a polyline the HUD strokes. */
  line: PacePoint[];
  /** The head on the exit — tip first, then the two base corners. */
  head: [PacePoint, PacePoint, PacePoint];
};

/** The box's side, user units. */
const BOX = 100;
/** Room kept clear inside it, for the line's own 13-wide stroke and for the
 * head, which straddles the exit. It is a first guess and not a guarantee —
 * `contain` is what actually keeps the sign inside the box. */
const PAD = 15;
/** The head, tip to base and half-width across it, user units. Deliberately
 * heavy — a third of the box across — because it is the half of the sign
 * that says which WAY, and the sign is read in the corner of an eye that is
 * busy with the road. */
const HEAD = 26;
const HEAD_HALF = 19;
/** How the head straddles the corner's exit: a little of it past the end of
 * the road, most of it back over it, so the line runs INTO the head instead
 * of stopping short of a floating triangle. */
const HEAD_LEAD = 0.42;
/** How much approach road is drawn before the corner opens, as a fraction of
 * the corner's own length. A fraction rather than a distance, because the
 * sign is fitted to the box afterwards: a hairpin then gets a hairpin's
 * run-up and a 300 m sweeper gets a sweeper's, and both read the same. */
const LEAD = 0.22;
/** How many points the drawn line carries. Enough that a double apex still
 * has two apexes in it, few enough that the sign reads as a drawn mark
 * rather than as a survey. */
const STEPS = 13;
/** How far the fit may pull one axis past the other. A gentle bend is a long
 * thin shape, and fitted honestly it is a straight line with a kink in it —
 * stretched across the box it is the bend it actually is. Capped at two, so
 * stylising a corner never turns it into a different corner. */
const STRETCH = 2;
/** The most corner the sign draws, radians. A note is a whole combination of
 * same-direction turns and can wind past a half circle; drawn honestly past
 * this the line crosses itself, and a sign eating its own tail says less
 * than one that stops where the corner stopped being one corner. */
const TURN_MAX = 3.4;
/** The same cap on the fallback arc, which has no samples to walk. */
const ARC_MAX = 2.6;
/** Points that fallback arc is integrated over. */
const ARC_STEPS = 16;

/** The corner's plan, in the box the HUD draws it in: the approach at the
 * bottom, the bend going the way it goes ON SCREEN, and a head on the exit.
 *
 * The rendered world is the engine's map view MIRRORED — snapshot.ts pays
 * that sign once for the words, and this pays it for the picture — so the
 * lateral axis is negated on the way in. A note whose `dir` is +1 grows the
 * heading, which is the road going LEFT through the windscreen, and comes
 * out of here bending left. */
export function cornerSign(samples: readonly TrackSample[], note: Pacenote): PaceSign {
  const line = fitToBox(smooth(resample(walkCorner(samples, note) ?? idealArc(note), STEPS)));
  return contain({ line, head: headOn(line) });
}

/** The head, straddling the last segment of the line so it points the way
 * the road leaves the corner. */
function headOn(line: readonly PacePoint[]): [PacePoint, PacePoint, PacePoint] {
  const [x1, y1] = line[line.length - 2];
  const [x2, y2] = line[line.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const baseX = x2 - ux * HEAD * (1 - HEAD_LEAD);
  const baseY = y2 - uy * HEAD * (1 - HEAD_LEAD);
  return [
    [x2 + ux * HEAD * HEAD_LEAD, y2 + uy * HEAD * HEAD_LEAD],
    [baseX - uy * HEAD_HALF, baseY + ux * HEAD_HALF],
    [baseX + uy * HEAD_HALF, baseY - ux * HEAD_HALF],
  ];
}

/** Pull the whole sign back inside the box if the head has taken it out —
 * about the box's centre, so the line and the head shrink together and the
 * picture stays the picture. Rare: PAD covers the ordinary case, and this is
 * what makes the guarantee a guarantee rather than a hope. */
function contain(sign: PaceSign): PaceSign {
  const mid = BOX / 2;
  let k = 1;
  /** The most this coordinate lets the sign keep, given the ink that reaches
   * past it: half the stroke on the line, nothing on the head's own corners. */
  const room = (v: number, ink: number): void => {
    const out = Math.abs(v - mid);
    if (out > 0) k = Math.min(k, (mid - ink) / out);
  };
  for (const [x, y] of sign.line) {
    room(x, 7);
    room(y, 7);
  }
  for (const [x, y] of sign.head) {
    room(x, 0);
    room(y, 0);
  }
  if (k >= 1) return sign;
  const pull = (p: PacePoint): PacePoint => [mid + (p[0] - mid) * k, mid + (p[1] - mid) * k];
  return {
    line: sign.line.map(pull),
    head: [pull(sign.head[0]), pull(sign.head[1]), pull(sign.head[2])],
  };
}

/** First sample at or past an arc position; the last sample when the stage
 * does not reach that far yet. */
function indexAt(samples: readonly TrackSample[], s: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The corner off the centerline, in the entry's own frame and already
 * flipped into screen axes (x right, y down), with the straight approach
 * hung off the bottom. Null when the compiled stage does not carry enough of
 * the note to draw — the streaming frontier, and a stage still being built. */
function walkCorner(samples: readonly TrackSample[], note: Pacenote): PacePoint[] | null {
  if (samples.length < 2) return null;
  const from = indexAt(samples, note.s);
  const to = indexAt(samples, note.endS);
  if (to - from < 2) return null;

  // The entry's frame: `f` is the way the road is pointing as the corner
  // opens, `n` the side a positive-dir turn bends toward (compile.ts puts
  // the turn's centre at `cos(h), -sin(h)` for dir +1).
  const at = samples[from];
  const fx = Math.sin(at.heading);
  const fz = Math.cos(at.heading);
  const nx = Math.cos(at.heading);
  const nz = -Math.sin(at.heading);

  const line: PacePoint[] = [];
  let run = 0;
  let turned = 0;
  for (let i = from; i <= to; i++) {
    if (i > from) turned += wrapped(samples[i].heading - samples[i - 1].heading);
    if (Math.abs(turned) > TURN_MAX) break;
    const dx = samples[i].x - at.x;
    const dz = samples[i].z - at.z;
    const point: PacePoint = [-(dx * nx + dz * nz), -(dx * fx + dz * fz)];
    if (line.length > 0) {
      const last = line[line.length - 1];
      run += Math.hypot(point[0] - last[0], point[1] - last[1]);
    }
    line.push(point);
  }
  if (line.length < 3) return null;
  line.unshift([0, run * LEAD]);
  return line;
}

/** An angle brought back into ±π — sample headings are kept modulo 2π, so
 * the step across the seam is a nudge and not a full turn. */
function wrapped(angle: number): number {
  let out = angle % (Math.PI * 2);
  if (out > Math.PI) out -= Math.PI * 2;
  if (out < -Math.PI) out += Math.PI * 2;
  return out;
}

/** A constant-radius bend of the note's own angle, for a corner the compiled
 * samples do not reach. Same axes, same approach, unit arc length. */
function idealArc(note: Pacenote): PacePoint[] {
  const turn = Math.min(note.angle, ARC_MAX) * note.dir;
  const line: PacePoint[] = [
    [0, LEAD],
    [0, 0],
  ];
  let lat = 0;
  let fwd = 0;
  for (let i = 1; i <= ARC_STEPS; i++) {
    const h = (turn * i) / ARC_STEPS;
    lat += Math.sin(h) / ARC_STEPS;
    fwd += Math.cos(h) / ARC_STEPS;
    line.push([-lat, -fwd]);
  }
  return line;
}

/** The same line, walked at an even stride. Evens out the approach against
 * the corner (they arrive at wildly different point densities) and gives the
 * head a last segment whose direction is the exit's, not one sample's. */
function resample(line: readonly PacePoint[], steps: number): PacePoint[] {
  const runs = [0];
  for (let i = 1; i < line.length; i++) {
    runs.push(runs[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  const total = runs[runs.length - 1];
  if (total <= 0) return line.map((p): PacePoint => [p[0], p[1]]);
  const out: PacePoint[] = [];
  let seg = 1;
  for (let i = 0; i < steps; i++) {
    const want = (total * i) / (steps - 1);
    while (seg < runs.length - 1 && runs[seg] < want) seg++;
    const span = runs[seg] - runs[seg - 1] || 1;
    const t = (want - runs[seg - 1]) / span;
    out.push([
      line[seg - 1][0] + (line[seg][0] - line[seg - 1][0]) * t,
      line[seg - 1][1] + (line[seg][1] - line[seg - 1][1]) * t,
    ]);
  }
  return out;
}

/** One 1-2-1 pass over the interior. The ends are pinned: the first point is
 * where the road comes in and the last is where the head goes. */
function smooth(line: PacePoint[]): PacePoint[] {
  if (line.length < 3) return line;
  const out: PacePoint[] = [line[0]];
  for (let i = 1; i < line.length - 1; i++) {
    out.push([
      (line[i - 1][0] + 2 * line[i][0] + line[i + 1][0]) / 4,
      (line[i - 1][1] + 2 * line[i][1] + line[i + 1][1]) / 4,
    ]);
  }
  out.push(line[line.length - 1]);
  return out;
}

/** Centre the shape in the box and scale it to fill, within STRETCH. */
function fitToBox(line: PacePoint[]): PacePoint[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of line) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const usable = BOX - 2 * PAD;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const kx = usable / w;
  const ky = usable / h;
  const even = Math.min(kx, ky);
  const sx = Math.min(kx, even * STRETCH);
  const sy = Math.min(ky, even * STRETCH);
  const originX = PAD + (usable - w * sx) / 2;
  const originY = PAD + (usable - h * sy) / 2;
  return line.map((p): PacePoint => [originX + (p[0] - minX) * sx, originY + (p[1] - minY) * sy]);
}
