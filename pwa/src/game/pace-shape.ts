// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CALL AS ITS OWN SIGN — the line the co-driver's strip draws is the
// stage's own drawing of the thing being called, walked off the compiled
// road. A corner is its PLAN, seen from above; a jump is its ELEVATION, seen
// from the side, with the estimated flight arcing over the road that falls
// away under it. Two projections, one hand.
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

import type { JumpArc, Pacenote, TrackSample } from "@engine";

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

/** THE SIGN, PART DRIVEN — what of it is lit, at a given fraction through the
 * corner. The two shapes are filled in turn, because they are the two halves
 * of one mark: the road runs up to the head's base, and then the HEAD ITSELF
 * fills, from that base to its point.
 *
 * The head is swept rather than faded. It is the half of the sign that says
 * which WAY, it is a third of the box across, and a triangle that merely
 * brightens is a triangle whose corners are still arriving when the corner is
 * over — the lit road runs into the MIDDLE of it (the base sits back over the
 * road by `HEAD * (1 - HEAD_LEAD)`) and the two wings are left behind.
 * Sweeping it fills the whole thing, in the direction the road leaves in.
 *
 * The split between the two is MEASURED off the sign rather than chosen: the
 * head's share is its own depth, base to point, against the road's length up
 * to that base. So a sign fitted wide and a sign fitted tall both hand the
 * head the part of the fill it actually occupies. */
export type PaceFill = {
  /** The drawn line's whole length, in the sign's box units — what the dash
   * that hides the unlit part of it is measured against. */
  span: number;
  /** How much of that length is lit, from the approach. */
  lit: number;
  /** The head, filled from its base toward its point: null until the road has
   * reached it, the whole triangle once the corner is driven. */
  head: PacePoint[] | null;
};

export function fillSign(sign: PaceSign, through: number): PaceFill {
  const span = lineLength(sign.line);
  const [tip, left, right] = sign.head;
  const baseX = (left[0] + right[0]) / 2;
  const baseY = (left[1] + right[1]) / 2;
  const depth = Math.hypot(tip[0] - baseX, tip[1] - baseY);
  // Where the head's base sits on the road, as a length back from the line's
  // end. Straight-line, which is the same thing here: the base is a couple of
  // resampled steps back down the EXIT, and an exit does not bend inside two
  // steps of itself.
  const last = sign.line[sign.line.length - 1];
  const road = Math.max(span - Math.hypot(last[0] - baseX, last[1] - baseY), 0);
  const along = Math.min(Math.max(through, 0), 1) * (road + depth);
  return {
    span,
    lit: Math.min(along, road),
    head: along <= road ? null : headTo(sign.head, Math.min((along - road) / (depth || 1), 1)),
  };
}

/** The head filled `t` of the way from its base to its point. The base edge is
 * square to that axis by construction (headOn offsets both corners
 * perpendicular to it), so the cut is the two long edges walked the same
 * fraction — a quad that closes onto the triangle itself at 1. */
function headTo(head: readonly [PacePoint, PacePoint, PacePoint], t: number): PacePoint[] {
  const [tip, left, right] = head;
  const toTip = (p: PacePoint): PacePoint => [
    p[0] + (tip[0] - p[0]) * t,
    p[1] + (tip[1] - p[1]) * t,
  ];
  return [left, toTip(left), toTip(right), right];
}

/** A polyline's length. */
function lineLength(line: readonly PacePoint[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  }
  return total;
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

// ---------------------------------------------------------------------------
// THE JUMP AS ITS OWN SIGN
// ---------------------------------------------------------------------------

/** How much road is drawn in FRONT of the lip, m — enough that the ramp is a
 * ramp with a grade to read rather than a line that stops. Metres and not a
 * fraction of the flight, unlike the corner's LEAD: a corner is fitted to the
 * box afterwards and has no natural scale, where a jump's own length is the
 * thing the sign is FOR, and a run-up that grew with it would cancel it out
 * exactly. */
const JUMP_LEAD = 20;
/** ...and how much past the landing, m. Shorter than the run-up: the road
 * after touchdown is where the call has stopped mattering. */
const JUMP_RUNOUT = 18;

/** Room kept clear around the jump's profile, user units — tighter than the
 * corner's PAD, and it buys the one measurement the sign lives or dies on.
 * What a jump call says is the DAYLIGHT between the arc and the ground that
 * has dropped away under it, and that gap is what is left after both strokes
 * have taken their half-widths out of it. Every unit of box the padding does
 * not spend is a unit of gap. */
const JUMP_PAD = 10;

/** How much the sign exaggerates the vertical against the horizontal.
 *
 * A jump is a hundred metres of road with three to ten metres of height in
 * it, and drawn honestly it is a horizontal line — the ramp, the flight and
 * the ground falling away are all inside the stroke's own width. The whole
 * point of an elevation is the height, so the height is stretched.
 *
 * TEN, so that the stage's own lips land across the box rather than at one
 * end of it: over 48 lips from seeds 1-12 at all three lengths, the drawn
 * profile's height-to-length ratio runs 0.03 to 0.098, and ten times the
 * horizontal scale puts those between a third of the box and the whole of
 * it. So a small lip is a shallow mark and a big one plunges, and neither
 * has to be measured against anything to be read that way. */
const JUMP_VERT = 10;

/** A jump, drawn from the side: the road up to the lip, the estimated flight
 * over the gap, and the road it comes back down to.
 *
 * The four lines share ONE fit, so they are one picture: the arc really does
 * clear the ground it is drawn over, and the height it clears it by is the
 * air the call is about. */
export type JumpSign = {
  /** The road into the lip — the approach and the ramp face. */
  ramp: PacePoint[];
  /** The road the flight passes OVER, lip to touchdown. It is drawn and it
   * never lights: the car is not on it, and the daylight between it and the
   * arc is the whole call. */
  gap: PacePoint[];
  /** The road from touchdown on. */
  landing: PacePoint[];
  /** The estimated flight itself, lip to touchdown. */
  flight: PacePoint[];
  /** THE AIR: the region the flight encloses against the road beneath it,
   * closed and ready to wash. The arc and the ground are two thin lines and
   * the jump is the space between them — as a filled area that space survives
   * being scaled down and dimmed in the strip's second slot, where two
   * hairlines do not, and it says how much air at a glance instead of asking
   * for the gap to be measured by eye. */
  air: PacePoint[];
  /** What share of the call's road each DRIVEN part is worth, summing to 1 —
   * measured off the stage in metres, not off the drawn line, so the fill
   * tracks the car rather than the fitting. */
  share: { ramp: number; flight: number; landing: number };
  /** The estimated jump length, m: how much air the flight covers. */
  length: number;
  /** Arc position the sign starts at and ends at, m — what `progressS` is
   * read against to fill it. */
  startS: number;
  endS: number;
};

/** The jump's sign, in the same 100x100 box the corner's is drawn in.
 *
 * `arc` is the engine's own estimate of the flight (`jumpArc`), so the
 * picture and the word on the plate come off ONE ballistic answer and cannot
 * describe different jumps. */
export function jumpSign(
  samples: readonly TrackSample[],
  lipIndex: number,
  arc: JumpArc,
): JumpSign {
  const lip = samples[lipIndex];
  const first = samples[0].s;
  const last = samples[samples.length - 1].s;
  const startS = Math.max(first, lip.s - JUMP_LEAD);
  const landS = Math.min(last, lip.s + arc.length);
  const endS = Math.min(last, landS + JUMP_RUNOUT);

  // The road under all of it, in the lip's own frame: metres along the stage
  // from the lip, metres above the road's height at it. The three joints are
  // put in by hand so the pieces below meet exactly where they are split.
  const ground = (s: number): PacePoint => [s - lip.s, groundAt(samples, s) - lip.elevation];
  const ramp = [ground(startS), ...between(samples, startS, lip.s, ground), [0, 0] as PacePoint];
  const gap = [[0, 0] as PacePoint, ...between(samples, lip.s, landS, ground), ground(landS)];
  const landing = [ground(landS), ...between(samples, landS, endS, ground), ground(endS)];
  // The flight lands ON the road rather than near it: `jumpFlight` found
  // touchdown by the same interpolation `groundAt` walks, so the two agree to
  // within a sample step — and a sign whose arc stops a stroke short of the
  // ground it just landed on reads as a car that did not come down.
  //
  // Cut to `landS` first, for the one case where they genuinely part company:
  // at an endless stage's streaming frontier the flight is longer than the
  // road compiled so far, and the arc's own points would otherwise carry on
  // past the end of the ground and hang the sign off its box.
  const landX = landS - lip.s;
  const flight = arc.points.filter((p) => p.s < landX).map((p): PacePoint => [p.s, p.y]);
  flight.push(ground(landS));

  const span = Math.max(endS - startS, 1e-6);
  // Out along the flight and back along the road under it: both run the same
  // way down the stage and share their two ends, so reversing one closes the
  // daylight between them into a simple polygon.
  const air = [...flight, ...gap.slice().reverse()];
  return fitJump({
    ramp,
    gap,
    landing,
    flight,
    air,
    share: {
      ramp: (lip.s - startS) / span,
      flight: (landS - lip.s) / span,
      landing: (endS - landS) / span,
    },
    length: arc.length,
    startS,
    endS,
  });
}

/** The road's height at an arc position, interpolated between the samples
 * either side of it and held flat past the ends of the compiled stage. */
function groundAt(samples: readonly TrackSample[], s: number): number {
  const i = indexAt(samples, s);
  if (i <= 0) return samples[0].elevation;
  const a = samples[i - 1];
  const b = samples[i];
  const step = b.s - a.s;
  if (step <= 0) return b.elevation;
  const t = Math.min(Math.max((s - a.s) / step, 0), 1);
  return a.elevation + (b.elevation - a.elevation) * t;
}

/** The samples strictly inside an arc span, mapped. The joints themselves are
 * added by the caller, which is what lets two neighbouring pieces share a
 * point exactly instead of nearly. */
function between(
  samples: readonly TrackSample[],
  from: number,
  to: number,
  map: (s: number) => PacePoint,
): PacePoint[] {
  const out: PacePoint[] = [];
  for (let i = indexAt(samples, from); i < samples.length && samples[i].s < to; i++) {
    if (samples[i].s > from) out.push(map(samples[i].s));
  }
  return out;
}

/** All four lines into the box under ONE transform, flipped into screen axes
 * (x right along the stage, y DOWN, so higher road is higher on the sign).
 *
 * The length is fitted to the box's width and the height is then stretched
 * against it by JUMP_VERT — capped, so the tallest lip on any stage is
 * contained rather than clipped. Fitting the length means every call is the
 * same size on screen, which is the corner sign's rule too; what varies is
 * the SHAPE, and here that is how much of the sign is air and how far the
 * ground drops out from under it. */
function fitJump(sign: JumpSign): JumpSign {
  const lines = [sign.ramp, sign.gap, sign.landing, sign.flight];
  // `air` is those same points closed into a region, so it can add nothing to
  // the bounds and is left out of the measuring.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const line of lines) {
    for (const [x, y] of line) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const usable = BOX - 2 * JUMP_PAD;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const sx = usable / w;
  const sy = Math.min(sx * JUMP_VERT, usable / h);
  const originX = JUMP_PAD;
  // Centred on the box's own middle rather than hung from the top: a shallow
  // lip draws a short shape, and a short shape pinned to one edge reads as a
  // sign that has slipped rather than as a small jump.
  const originY = JUMP_PAD + (usable + h * sy) / 2;
  const place = (line: PacePoint[]): PacePoint[] =>
    line.map((p): PacePoint => [originX + (p[0] - minX) * sx, originY - (p[1] - minY) * sy]);
  return {
    ...sign,
    ramp: place(sign.ramp),
    gap: place(sign.gap),
    landing: place(sign.landing),
    flight: place(sign.flight),
    air: place(sign.air),
  };
}

/** One drawn line, and how much of it is lit — what the dash hiding the
 * unlit part is measured against. */
export type PaceSpan = { span: number; lit: number };

/** THE JUMP SIGN, PART DRIVEN. The three parts the car is actually on light
 * in turn — up the ramp, through the air, away down the landing — and the
 * road under the flight never does, because the car is not on it.
 *
 * The split between them is MEASURED off the stage: each part gets the share
 * of the fill that its own metres of road are worth (`share`), not the share
 * of the drawn line it happens to occupy after the fitting stretched the
 * vertical. So the lit end of the sign sits where the car sits — a driver who
 * is halfway down the ramp sees a sign lit halfway up its ramp, and one who
 * is in the air sees the arc coming up under them. */
export function fillJump(sign: JumpSign, through: number): JumpFill {
  let left = Math.min(Math.max(through, 0), 1);
  const part = (line: PacePoint[], share: number): PaceSpan => {
    const span = lineLength(line);
    const t = share > 0 ? Math.min(left / share, 1) : left > 0 ? 1 : 0;
    left = Math.max(left - share, 0);
    return { span, lit: span * t };
  };
  return {
    ramp: part(sign.ramp, sign.share.ramp),
    flight: part(sign.flight, sign.share.flight),
    landing: part(sign.landing, sign.share.landing),
  };
}

export type JumpFill = {
  ramp: PaceSpan;
  flight: PaceSpan;
  landing: PaceSpan;
};
