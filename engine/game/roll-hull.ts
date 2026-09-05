// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHAPE A CRASHING CAR IS, and the ground it is lying on.
//
// The car is the box in `TUNING.collision`: a length, a width, a height,
// four wheel contacts inboard of the corners, and a WEIGHT in it. The box
// is one box for the whole catalog; the weight is each car's own — how high
// it rides and how far forward it sits (`CarSpec.centreHeight`, `balance`),
// carried as `MassSpread.weight` so every question below is asked of the
// car actually crashing. Everything a crash does is that box turning
// against a plane.
//
// TWO THINGS ARE STATED HERE AND NOWHERE ELSE.
//
// THE SURFACE. Turn the box and the height its weight has to be lifted to
// stand on the plane rises and falls. The valleys of that surface are the
// attitudes the body comes to rest at — on its wheels, on either flank, on
// its nose or tail, on its roof — and the ridges between them are the
// corners a crash has to have the energy to climb. Gravity pulls the centre
// downhill along it. That is the whole model, and it is a surface over TWO
// angles rather than a curve over one, because a crashing body is rolled
// and pitched at once: a car goes over ACROSS itself (the barrel roll a
// sideways trip puts it into) and ALONG itself (the end-over-end a long
// jump landed nose-first puts it into), and usually both, which is what a
// corkscrew is.
//
// THE GROUND IS A NORMAL, NOT TWO ANGLES. Every question here is asked
// about the body's attitude RELATIVE TO THE PLANE IT IS ON, and a hillside
// is a plane tilted in two directions at once. Subtracting a cross-slope
// from the roll and a grade from the pitch is not that rotation and does
// not behave like it: the ground's grade along the car ends up deciding
// which way the body falls ACROSS it, and a car staged on its roof on a
// plain 24° bank — which should sit in a valley and simply slide down —
// gets pulled off the roof at a tenth of a radian a second and stands
// itself back up. Dotting the turned box against the plane's own normal is
// the rotation, and on that surface a roof on a bank is a minimum, which is
// what "it slides" means.

import { TUNING } from "./defs/tuning.ts";
import { rollTilt } from "./state.ts";

const R = TUNING.air.roll;
const B = TUNING.collision;

/** ONE POINT OF THE BOX, in the car's own frame: across (+ right), up from
 * the wheel contact plane (which is what `CarState.y` is), along (+ nose),
 * and whether it is SPRUNG.
 *
 * That last field matters twice: a WHEEL arriving at the ground is what the
 * suspension exists to swallow and hands most of the blow back instead of
 * taking it out of the body (`pivotKeep`), and a car whose lowest points
 * are its wheels is a car somebody can drive (`standingOn`). Without the
 * first, a car merely levered up through level pays a flat-on-both-wheels
 * impact for passing through upright, which is nine tenths of any trip gone
 * before the car has left the ground. */
type Point = readonly [number, number, number, boolean];

/** THE BOX. Four wheel contacts at the track's half-width and the axles,
 * and the eight corners of the shell out at the bumpers. Every point a car
 * can come to rest on. */
export const HULL: readonly Point[] = (() => {
  const out: Point[] = [];
  for (const along of [B.halfBase, -B.halfBase]) {
    out.push([B.halfTrack, 0, along, true], [-B.halfTrack, 0, along, true]);
  }
  for (const along of [B.halfLength, -B.halfLength]) {
    for (const up of [B.floorY, B.roofY]) {
      out.push([B.halfWidth, up, along, false], [-B.halfWidth, up, along, false]);
    }
  }
  return out;
})();

/** THE GROUND'S OWN NORMAL, in the car's heading frame — across, up, along.
 * A plane sloping `slope` along the car and `slopeLat` across it (both
 * dy/ds, the same pair the handling model reads) has this pointing out of
 * it. Unit length, so a dot product against it is a height. */
export type Bed = { readonly across: number; readonly up: number; readonly along: number };
export function bedNormal(slopeLat = 0, slope = 0): Bed {
  const len = Math.hypot(slopeLat, 1, slope);
  return { across: -slopeLat / len, up: 1 / len, along: -slope / len };
}
export const LEVEL: Bed = { across: 0, up: 1, along: 0 };

/** WHERE THE WEIGHT IS in the box: how high over the wheel plane, and how
 * far ahead of the axle midpoint (+ toward the nose). Across the car it is
 * on the centreline, always — nothing in the catalog is loaded to one side.
 *
 * This is what separates the cars once they are over. A tall hatch with
 * its engine over the front axle climbs its sill corner more easily than a
 * low coupe and goes over its nose more readily than its tail; every arm
 * the friction and the contacts work on is measured from here. */
export type Weight = { readonly up: number; readonly along: number };

/** The catalog's reference weight — the box's own, for anything asking a
 * geometric question with no car in hand (the labs' basin, the tests'
 * benches, `onItsWheels`, which does not depend on it). */
export const REFERENCE: Weight = { up: B.centreY, along: 0 };

/** WHERE A BODY POINT SITS at a given attitude, in the heading frame.
 *
 * The composition is the renderer's, stated once: in the car's local frame
 * +z is the nose and +x its right side, so a positive roll (right side up)
 * is a rotation about +z, and a nose-up pitch is a NEGATIVE one about +x —
 * turning the nose down is the positive direction there. Heading is applied
 * outside this, about the world's vertical, and cannot change a height. */
function turned(
  p: Point | readonly [number, number, number],
  tilt: number,
  pitch: number,
): { across: number; up: number; along: number } {
  const cr = Math.cos(tilt);
  const sr = Math.sin(tilt);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const across = p[0] * cr - p[1] * sr;
  const lifted = p[0] * sr + p[1] * cr;
  return {
    across,
    up: lifted * cp + p[2] * sp,
    along: -lifted * sp + p[2] * cp,
  };
}

/** ...and how high that is ABOVE THE PLANE: the turned point dotted against
 * the ground's own normal. Level ground gives back the plain height, which
 * is why nothing on flat ground can tell the difference. */
function heightOn(
  p: Point | readonly [number, number, number],
  tilt: number,
  pitch: number,
  bed: Bed,
): number {
  const t = turned(p, tilt, pitch);
  return t.across * bed.across + t.up * bed.up + t.along * bed.along;
}

/** EVERY POINT OF THE BOX at this attitude, in the car's own heading frame
 * — how far right, how far up, how far ahead of the origin. Walked by
 * whatever has to ask the ground under the BODY rather than the ground
 * under its middle. */
export function turnedPoints(
  tilt: number,
  pitch: number,
): { across: number; up: number; along: number }[] {
  return HULL.map((p) => turned(p, tilt, pitch));
}

/** How far the origin has to be lifted for the WHOLE box to clear the
 * plane, m — the deepest any of its points has gone below it. Zero upright
 * and level, `halfWidth` on its side, the height of the car on its roof,
 * and more than any of those once the body is pitched as well, because it
 * is then standing on one END of a face instead of on all of it. */
export function clearOn(tilt: number, pitch: number, bed: Bed = LEVEL): number {
  let lowest = 0;
  for (const p of HULL) {
    const h = heightOn(p, tilt, pitch, bed);
    if (h < lowest) lowest = h;
  }
  return -lowest;
}

/** THE SURFACE: how high the weight in the car sits above the plane it is
 * lying on, m. The one thing the whole model runs on — its valleys are the
 * faces a body comes to rest on and its ridges are the corners a crash has
 * to climb. */
export function seatOn(
  tilt: number,
  pitch: number,
  bed: Bed = LEVEL,
  weight: Weight = REFERENCE,
): number {
  return clearOn(tilt, pitch, bed) + heightOn([0, weight.up, weight.along], tilt, pitch, bed);
}

/** Its two slopes, m per rad — the gravity torque about each of the body's
 * axes, up to the inertia that axis works against. Read as differences
 * rather than in closed form because the surface is a MIN over the box's
 * corners and has a kink at every handover from one to the next; the
 * difference rounds those off, which is what a tyre and a bent sill do to
 * them anyway.
 *
 * A VALLEY FLOOR IS FLAT. The surface's valleys are the faces a body rests
 * on, and each is a V with a kink at its bottom rather than a bowl; a
 * central difference straddling the kink reads the MEAN of the two sides.
 * With the weight on the box's centreline that mean is zero, which is why
 * it went unnoticed — but a weight carried ahead of the axle midpoint makes
 * every V asymmetric (steeper toward the nose than the tail), and the mean
 * is then a slope of `along` at the very bottom: a car lying flat on its
 * four wheels was pitched at a third of a g, for ever, by ground it was
 * resting on. So where the two sides of the difference disagree in sign
 * and the surface rises both ways, the body is in the valley and the
 * gradient is nothing — it rests, which is what the face does with the
 * moment. A ridge (falling both ways) keeps the mean: the body is going
 * over one side or the other and the question is only which. */
const STEP = 1e-3;

/** The gradient across a kink: the mean of the two one-sided differences,
 * unless they disagree in sign with the surface rising both ways — the
 * bottom of a valley, where a body rests. */
function kinked(before: number, here: number, after: number): number {
  const up = (after - here) / STEP;
  const down = (here - before) / STEP;
  if (up > 0 && down < 0) return 0;
  return (up + down) / 2;
}

/** THE SURFACE'S GRADIENT under a body, m per rad in each plane. Gravity is
 * resolved along it, the seat's own speed under a turning body is read off
 * it, and a contact's reaction is answered by it — one statement of which
 * way the weight goes when the body turns, so those three can never
 * disagree about which way a car falls. */
export type Slopes = { readonly roll: number; readonly pitch: number };

export function seatSlopes(
  tilt: number,
  pitch: number,
  bed: Bed = LEVEL,
  weight: Weight = REFERENCE,
): Slopes {
  const here = seatOn(tilt, pitch, bed, weight);
  return {
    roll: kinked(
      seatOn(tilt - STEP, pitch, bed, weight),
      here,
      seatOn(tilt + STEP, pitch, bed, weight),
    ),
    pitch: kinked(
      seatOn(tilt, pitch - STEP, bed, weight),
      here,
      seatOn(tilt, pitch + STEP, bed, weight),
    ),
  };
}

/** WHAT THE BODY IS STANDING ON, right now.
 *
 * Everything about a contact is geometry, and asking the box directly beats
 * every angle test that used to stand in for it:
 *
 *   - `flat` — a whole FACE is on the plane: four points of the box near
 *     enough to it, REACHING BOTH WAYS. It replaces rounding an angle to
 *     the nearest quarter turn and then comparing against a bed, which
 *     cannot be done honestly on a plane tilted two ways. The reach is what
 *     separates a face from an EDGE, and counting alone cannot: a car up on
 *     one side has four points down — two wheels and the two sill corners
 *     over them — in a line two metres long and a hand's breadth wide.
 *   - `sprung` — the points holding the car up are its WHEELS. That is the
 *     whole of "is this a car somebody can drive": tyres on the ground,
 *     whatever angle the body is holding. A car balanced on two wheels
 *     passes it; a car on its nose does not, and neither does one on its
 *     roof, without anybody writing a basin for each.
 *   - `across` / `along` — where the patch is, in the ground plane, as an
 *     offset from the weight. This is the arm the friction under the car
 *     turns it about, and the reason a sliding car SPINS: a patch that is
 *     not under the middle of the car turns the body about the vertical
 *     just as surely as one below it rolls the body over. It is the one
 *     reading here that STEPS as the body walks from one corner to the
 *     next — see the note on the arm below.
 *   - `height` — how far the weight is above that patch, which is the arm
 *     for the other two moments. It is `seatOn` itself: the lowest point of
 *     the box is on the plane by construction, so the weight's height above
 *     the patch and its height above the plane are one number. Which is why
 *     the arm is CONTINUOUS through a corner hand-over and needs no blend —
 *     the box does not get taller because a different corner is holding it
 *     up. Measured over a turn it moves at its own gradient and never
 *     steps, where the patch OFFSET beside it steps by most of a metre. */
export type Patch = {
  readonly flat: boolean;
  readonly sprung: boolean;
  readonly across: number;
  readonly along: number;
  readonly height: number;
  /** HOW FAR THE PATCH REACHES either side of itself, in the ground plane.
   * A body lying flat on a face is not standing on a point: the face is
   * metres long, and the normal force under it SHIFTS within that face to
   * meet a moment before the body turns at all. That is why a car sliding
   * on its roof tracks straight instead of tumbling end over end — the
   * friction's nose-down moment is `friction × the weight's height`, about
   * half a metre-per-newton, and the roof can answer it out to two metres
   * before it has to give. A point contact cannot express any of that and
   * pitches the body over from the first step. */
  readonly spanAcross: number;
  readonly spanAlong: number;
};

/** WHAT IS BEARING, m — how far off the plane a point may stand and still be
 * carrying load. Not zero, because neither the shell nor the ground is the
 * plane the arithmetic pretends: a sill on gravel beds in, a panel folds,
 * and a corner a couple of centimetres proud of the mud is on the mud. */
const ON_PLANE = 0.02;

/** ...AND WHAT IT IS LYING ON, rad — how far from parallel the plane and a
 * face of the box may be and still be the same contact.
 *
 * These are two questions and conflating them was the whole of why the face
 * never answered anything. A face is METRES long, so "within a couple of
 * centimetres of the lowest point" asks a four-metre roof to be within a
 * hundredth of a degree of the ground before it counts as being on it —
 * which, measured over five crash scenarios, was true in one step out of
 * nineteen hundred. The body was on a single point for the whole of every
 * accident: nothing answered the friction's moment, and the roll could never
 * report that it had come to lie on anything.
 *
 * Asked as an ANGLE it is scale-free and says what it means. A car on its
 * roof a few degrees off is lying on its roof, and the load shifts across
 * that roof as it rocks the last few degrees down — which is exactly the
 * reach `roll.ts` prices a friction moment against. */
const ON_FACE = R.settled;

export function standingOn(
  tilt: number,
  pitch: number,
  bed: Bed = LEVEL,
  weight: Weight = REFERENCE,
): Patch {
  let lowest = Infinity;
  let onIt = turned(HULL[0], tilt, pitch);
  for (const p of HULL) {
    const t = turned(p, tilt, pitch);
    const h = t.across * bed.across + t.up * bed.up + t.along * bed.along;
    if (h < lowest) {
      lowest = h;
      onIt = t;
    }
  }
  // The mean of everything actually touching, which for a face down is the
  // middle of that face and for a corner is the corner.
  let n = 0;
  let across = 0;
  let along = 0;
  let sprung = true;
  // ...and, separately, the FACE it is lying on: everything near enough to
  // the plane, for how far out it is, that the body only has to rock the
  // last degree or two onto it. That is the set the load may shift within.
  let face = 0;
  let minAcross = Infinity;
  let maxAcross = -Infinity;
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  for (const p of HULL) {
    const t = turned(p, tilt, pitch);
    const over = t.across * bed.across + t.up * bed.up + t.along * bed.along - lowest;
    if (over <= ON_PLANE) {
      n += 1;
      across += t.across;
      along += t.along;
      if (!p[3]) sprung = false;
    }
    // How far this point stands from the lowest one, in the plane — the arm
    // the tilt between them is read over.
    const reach = Math.hypot(t.across - onIt.across, t.along - onIt.along);
    if (over > ON_PLANE + reach * ON_FACE) continue;
    face += 1;
    if (t.across < minAcross) minAcross = t.across;
    if (t.across > maxAcross) maxAcross = t.across;
    if (t.along < minAlong) minAlong = t.along;
    if (t.along > maxAlong) maxAlong = t.along;
  }
  const centre = turned([0, weight.up, weight.along], tilt, pitch);
  const spanAcross = (maxAcross - minAcross) / 2;
  const spanAlong = (maxAlong - minAlong) / 2;
  return {
    // FOUR POINTS DOWN AND REACHING BOTH WAYS. Four in a LINE is a body up
    // on its edge, which is the one attitude a crash most needs to know is
    // not a resting place — it is the ridge between two faces, and calling
    // it one handed a braked crash back balanced on its sill and had the
    // run retire it in the same step.
    flat: face >= 4 && Math.min(spanAcross, spanAlong) >= R.faceSpan,
    sprung,
    across: across / n - centre.across,
    along: along / n - centre.along,
    height: heightOn([0, weight.up, weight.along], tilt, pitch, bed) - lowest,
    spanAcross,
    spanAlong,
  };
}

/** WHICH FACE IS DOWN, as one number: the body's own up-axis against the
 * plane it is lying on. +1 on its wheels, 0 on a flank or an end, -1 on its
 * roof. Two angles and any slope collapse into this, which is exactly what
 * the faces are — everything in the module that asks "what is the ground
 * holding" asks it here rather than off an angle. */
export function faceUp(tilt: number, pitch: number, bed: Bed = LEVEL): number {
  return heightOn([0, 1, 0], tilt, pitch, bed);
}

/** HOW MUCH OF WHAT IS ON THE GROUND IS RUBBER, 0..1 — the same reading,
 * floored at nothing. 1 with the tyres squarely down, about 0.7 for a body
 * balanced over at 45°, and exactly 0 from the flank round to the roof.
 *
 * It is named separately from `gripOn` because the DRIVER depends on it: a
 * pedal and a steering wheel reach the world through tyres and through
 * nothing else, so a car on its side has nobody left to ask, and a car up on
 * two wheels still has two. */
export function tyreShare(tilt: number, pitch: number, bed: Bed = LEVEL): number {
  return Math.max(0, faceUp(tilt, pitch, bed));
}

/** WHAT IS ON THE GROUND HERE, as a Coulomb coefficient — read off the FACE
 * the box is nearest rather than off an angle, so it is right in both
 * planes and on any slope at once.
 *
 * A body on the ground has one contact patch and one budget, and `roll.ts`
 * spends it on every job it can do at once. What changes with the attitude
 * is WHAT the ground is holding: rubber being dragged at the wheels, a
 * smooth door skin on a flank, a bumper and a valance on the nose, and
 * glass and pillars and gutters digging in on the roof. Blended by how far
 * the body is from lying flat on that face, never stepped, because a body
 * going over passes through every attitude between them and a coefficient
 * that jumped at each face would kick the crash every quarter turn. */
export function gripOn(tilt: number, pitch: number, bed: Bed = LEVEL): number {
  const up = faceUp(tilt, pitch, bed);
  const g = R.faceGrip;
  // ...and which of the two "on its side" faces it is: a flank or an end.
  const across = Math.abs(heightOn([1, 0, 0], tilt, pitch, bed));
  const along = Math.abs(heightOn([0, 0, 1], tilt, pitch, bed));
  const side =
    across + along > 1e-6 ? (g.flank * across + g.end * along) / (across + along) : g.flank;
  return up >= 0 ? side + (g.wheels - side) * up : side + (g.roof - side) * -up;
}

/** THE PLANES A BODY GOES OVER IN. The physics is identical; only the
 * inertias differ, and they differ because the box does: it is four metres
 * long and under two wide, so the weight sits further from an axis ACROSS
 * the car than from one down it, and the climb from the wheels up over the
 * NOSE is more than twice the climb up over the sill. That is the whole
 * reason a rally car barrel-rolls readily and only occasionally stands
 * itself on its face — nobody chose it. */
export type Axis = "roll" | "pitch";

/** HOW ONE CAR'S MASS IS SPREAD, in the two forms the crash needs it.
 *
 * All of it is mass-normalised — radii of gyration squared, m² — because
 * every term in `roll.ts` divides the car's mass straight out. What is left
 * is the SPREAD, and that is a real difference between cars: over this
 * roster's 1020-1300 kg it moves 12% in roll and about a quarter in pitch
 * and yaw, so the heavy coupe genuinely resists an end-over-end and a spin
 * where the hatch does not.
 *
 *   `spin` / `yaw` — about the body's OWN axes through its weight. What a
 *   free body turns with, what a rotation's ENERGY is worth, and what
 *   `pivotKeep` trades when a face arrives flat.
 *
 *   `over` — about the CORNER the body is going over, which is what a
 *   rolling car actually turns about. The same distribution moved onto that
 *   corner by the parallel-axis theorem: the central radius plus the square
 *   of the arm from the weight out to the corner. Stated here rather than
 *   tuned separately, because the two are one distribution and letting them
 *   be two numbers lets them disagree — the old pair had the pitch a third
 *   lower than its own geometry allows, which is a body that goes end over
 *   end more easily than the box it is made of.
 */
export type MassSpread = {
  readonly spin: Record<Axis, number>;
  readonly yaw: number;
  readonly over: Record<Axis, number>;
  /** ...and where that mass SITS in the box, which every arm above is
   * measured from and every geometric question below is asked of. */
  readonly weight: Weight;
};

/** What a car has to say about its own mass: how much, and where it sits.
 * A catalog row satisfies it; the two placement fields are read against
 * the box's reference when a spec leaves them out. */
export type MassSource = {
  readonly mass: number;
  /** Share of the weight over the FRONT axle, 0..1. */
  readonly balance?: number;
  /** How high the weight rides over the wheel plane, m. */
  readonly centreHeight?: number;
};

const spreads = new Map<string, MassSpread>();

/** ...and the car's own, off its kerb mass and where it carries it.
 * Memoised: a roster is three cars and a field is fifteen of them, and
 * this is asked every step. */
export function massSpread(spec: MassSource): MassSpread {
  const up = spec.centreHeight ?? B.centreY;
  const balance = spec.balance ?? 0.5;
  const key = `${spec.mass}:${up}:${balance}`;
  const had = spreads.get(key);
  if (had) return had;
  const S = R.spread;
  const mass = spec.mass;
  // The measured regressions, divided by the mass they were measured
  // against — an inertia per kg is a radius of gyration squared...
  let roll = S.rollSlope + S.rollBase / mass;
  let pitch = S.pitchSlope + S.pitchBase / mass;
  let yaw = S.yawSlope + S.yawBase / mass;
  // ...for a ROAD car. A rally car carries a cage the database's cars did
  // not: tube welded out at the sills, the pillars and the roof, which is
  // mass a long way from every axis. Its own radii, at its own mass, added
  // per kilogram of the car it is in (`spread.cage`).
  const C = S.cage;
  roll += (C.mass * C.roll * C.roll) / mass;
  pitch += (C.mass * C.pitch * C.pitch) / mass;
  yaw += (C.mass * C.yaw * C.yaw) / mass;
  // The weight sits at the front share's point between the axles: a
  // front-heavy hatch carries it a hand ahead of the wheelbase's middle.
  const weight: Weight = { up, along: (balance - 0.5) * 2 * B.halfBase };
  // The arms from the weight out to the corner the body turns about, m² —
  // the sill corner for a barrel roll, the end corners for an end-over-end
  // (the nose's and the tail's, averaged: `over.pitch` serves both ways).
  const sillArm = B.halfWidth * B.halfWidth + up * up;
  const endArm = B.halfLength * B.halfLength + weight.along * weight.along + up * up;
  const made: MassSpread = {
    spin: { roll, pitch },
    yaw,
    over: { roll: roll + sillArm, pitch: pitch + endArm },
    weight,
  };
  spreads.set(key, made);
  return made;
}

/** The highest the weight has to be lifted to get from here to the next
 * face it could come to rest on, m — everything between it and there, not
 * merely the first bump. Walked live rather than read off a table, because
 * a table cannot hold the ground's own tilt and the whole point is that
 * this is asked against the plane the body is actually on. Two degrees a
 * step resolves a corner to well under a millimetre of lift. */
const WALK = (2 * Math.PI) / 180;
function barrier(
  axis: Axis,
  tilt: number,
  pitch: number,
  dir: number,
  bed: Bed,
  weight: Weight,
): number {
  const step = dir > 0 ? WALK : -WALK;
  let highest = -Infinity;
  let at = 0;
  for (let n = 0; n < 90; n += 1) {
    at += step;
    const h =
      axis === "roll"
        ? seatOn(tilt + at, pitch, bed, weight)
        : seatOn(tilt, pitch + at, bed, weight);
    if (h > highest) highest = h;
    // Over the ridge and coming down the far side is the next face: the
    // climb up to here is the whole of what the body had to pay.
    else if (highest > -Infinity && n > 1) break;
  }
  return highest;
}

/** DOES IT GO OVER? Energy, not a threshold: the rotation the body carries
 * has to be worth the lift from where its weight stands now up to the
 * corner it is turning toward. This is the one question that decides
 * whether a landing taken sideways is a car that lurches and drives on or a
 * car about to spend the next second upside down — and the answer moves
 * with the attitude the body is already at, which is why a car half over
 * goes the rest of the way on far less than it took to get there. */
export function goesOverOn(
  axis: Axis,
  tilt: number,
  pitch: number,
  rate: number,
  mass: MassSpread,
  bed: Bed = LEVEL,
): boolean {
  if (rate === 0) return false;
  const climb =
    barrier(axis, tilt, pitch, rate, bed, mass.weight) - seatOn(tilt, pitch, bed, mass.weight);
  // Nothing to climb is not a car going over — it is a car falling back into
  // the face it is already beside, which is what a body a fraction of a
  // degree off level and settling is doing on every step of every straight.
  if (climb <= 0) return false;
  return 0.5 * mass.over[axis] * rate * rate > TUNING.air.gravity * climb;
}

/** WHAT A CONTACT LEAVES OF THE ROTATION in one plane, 0..1, and how far
 * off the plane the corner that would take the exchange still is, m.
 *
 * The body turns about the corner it came over. When the NEXT corner
 * reaches the ground it starts turning about that one instead, and the
 * impulse between is what the exchange costs: angular momentum about the
 * arriving corner is what survives, so the answer is the two corners' own
 * geometry against `spin` and nothing else. That is why the faces behave so
 * differently without anybody choosing that they should — a car coming down
 * flat swaps a pivot for one a track's width away and keeps a twelfth of
 * its roll, a flank swaps for one across the body and keeps half, and a car
 * balanced on a wheel with its sill a hand's breadth off the ground swaps
 * for a corner barely off the one it is on and keeps nearly all of it. */
export function pivotKeep(
  axis: Axis,
  tilt: number,
  pitch: number,
  mass: MassSpread,
  bed: Bed = LEVEL,
): { keep: number; gap: number; sprung: boolean } {
  let low = Infinity;
  let next = Infinity;
  let on = HULL[0];
  let arriving = HULL[0];
  for (const p of HULL) {
    const h = heightOn(p, tilt, pitch, bed);
    if (h < low) {
      next = low;
      arriving = on;
      low = h;
      on = p;
    } else if (h < next) {
      next = h;
      arriving = p;
    }
  }
  // The arms from each corner to the weight, in the plane that is turning:
  // across the car for a roll, along it for an end-over-end — and the
  // weight is where THIS car carries it, so a nose-heavy car's nose corner
  // is the shorter arm.
  const out = axis === "roll" ? 0 : 2;
  const at = axis === "roll" ? 0 : mass.weight.along;
  const ax = at - on[out];
  const ay = mass.weight.up - on[1];
  const bx = at - arriving[out];
  const by = mass.weight.up - arriving[1];
  const spin = mass.spin[axis];
  const rigid = (spin + ax * bx + ay * by) / (spin + bx * bx + by * by);
  // ...and a SPRUNG corner arriving hands most of that back rather than
  // taking it: the spring stores the blow and returns it, which is the whole
  // job of a suspension and the reason a car can be rolled at all.
  const keep = arriving[3] ? 1 - (1 - rigid) * (1 - R.sprung) : rigid;
  return { keep: Math.max(0, Math.min(1, keep)), gap: next - low, sprung: arriving[3] };
}

/** IS THE CAR ON ITS WHEELS? Asked of the box and not of an angle: the
 * points holding it up are its tyres. A car balanced hard over on two of
 * them passes — that is a car somebody is driving — and a car on its nose
 * or its roof does not, without anybody writing a basin for either. */
export function onItsWheels(roll: number, pitch: number, bed: Bed = LEVEL): boolean {
  return standingOn(rollTilt(roll), rollTilt(pitch), bed).sprung;
}

/** HOW FAR OVER A CAR CAN LEAN AND STILL BE ON ITS WHEELS, rad — the tilt at
 * which the tyres stop being the lowest points of the box and a corner of
 * the shell takes over. Not a knob and not a threshold anything branches on
 * (`standingOn` answers that directly, in both planes and on any slope); it
 * is here because the labs and the tests want one number to say "past this
 * the car is not on its wheels any more". */
export const WHEEL_BASIN = (() => {
  const step = Math.PI / 720;
  for (let t = 0; t < Math.PI; t += step) if (!standingOn(t, 0).sprung) return t;
  return Math.PI;
})();
