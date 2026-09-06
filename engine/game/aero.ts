// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AIR, ONCE THE WHEELS ARE NOT HOLDING THE CAR UP.
//
// On the road the air is a rolling loss like any other and the surface owns
// it (`TUNING.surfaces.drag`). Off the ground it is the only thing the car is
// touching, and it decides both of the things a flight has to answer: how
// fast the car can possibly be going by the bottom of a fall, and which way
// it is pointing while it gets there.
//
// THE SPEED. Drag goes as the SQUARE of the speed, so a fall is not an
// acceleration that runs away — it is a race between gravity and the air that
// gravity loses, and the speed it loses at is the terminal velocity:
//
//     v_t = sqrt(2 · m · g / (rho · CdA))
//
// Everything interesting in that expression is CdA, and CdA is not one
// number. A car is a box whose three faces differ by a factor of nine, so
// WHICH WAY IT IS FALLING is most of the answer: nose-first it is a dart,
// flat it is a sheet of plywood. The three are blended by the SQUARE of each
// direction cosine — the cross-flow form, because a face a few degrees off
// the flow still has the air attached to it and is not yet the bluff plate it
// becomes once the flow separates.
//
// WHAT IS MEASURED AND WHAT IS A DIAL. The areas, the coefficients and the
// density are all quoted numbers and can be argued with from outside the
// game: the model puts a car falling flat at 186 km/h under the real 9.81,
// against the 160-190 the world quotes for one dropped from a height, and
// `tests/aero_test.ts` holds it there. Three knobs sit on top of that and are
// nobody's measurement — `air.gravity`, already 1.6 g so that a jump comes
// down briskly, and `aero.bite` and `aero.trim`, which are how hard the air
// pulls a fall up and how far it points the nose. Tune those; leave the
// measurements alone, or the sanity check above stops meaning anything.
//
// THE ATTITUDE. The same force does not act through the weight, and what is
// left over is a moment. Two levers matter: the body's own — its plan area
// pushes through the middle of the car while the weight sits ahead of that,
// so a nose-heavy car noses over in a fall — and the WING's, which is much
// the longer of the two and the only part of the car whose entire job is
// this. One rule covers both regimes because a wing is two different things
// to two different flows: an aerofoil to the air running along the car, where
// it makes downforce and lifts the nose over a jump, and a flat plate to the
// air coming up through it in a fall, where it is pushed up and puts the nose
// DOWN. Feathers on an arrow, and the same arithmetic.
//
// The car's mass divides the force, so a heavy car falls faster than a light
// one, for the same reason it always carries a hole better (`damage.ts`).

import { TUNING } from "./defs/tuning.ts";
import type { CarSpec } from "./defs/cars.ts";
import { intoBody } from "./roll-hull.ts";
import { rollTilt, type CarState } from "./state.ts";

const T = TUNING;
const A = T.air.aero;
const B = T.collision;

/** The airflow's direction in the car's OWN axes — how much of the travel
 * runs out through the nose, out through the side, and out through the roof.
 * Everything below is a question about one of those three. */
function flowOn(car: CarState, speed: number): { across: number; up: number; along: number } {
  return intoBody(
    { across: car.w / speed, up: car.vy / speed, along: car.u / speed },
    rollTilt(car.roll),
    rollTilt(car.pitch),
  );
}

/** THE CAR'S DRAG AREA AT THIS INSTANT, m² of CdA — the three faces blended
 * by how much of the airflow runs out through each of them, scaled by how
 * slippery this particular shape is, plus whatever the wing is catching.
 *
 * The body is symmetric enough front to back, roof to floor and side to side
 * that only the SIZE of each component matters here, which is what makes the
 * drag blind to the sign of the roll and of the pitch alike. The MOMENT
 * below is not, and that is the whole difference between the two. */
export function dragArea(spec: CarSpec, car: CarState): number {
  const speed = Math.hypot(car.u, car.w, car.vy);
  // Standing still there is no direction for the air to come from, and the
  // area is worth nothing anyway — the force it would scale is zero.
  if (speed < 1e-6) return A.nose * spec.aero.slip * A.bite;
  const flow = flowOn(car, speed);
  // THE SQUARE of each direction cosine, not its size. The PROJECTED AREA of
  // a box goes as the plain cosine, but the coefficient does not: a face a
  // few degrees off the flow still has the air attached to it and is nowhere
  // near the bluff plate it becomes once the flow has separated, and cross-
  // flow drag on a long body is the standard sin² for exactly that reason.
  //
  // It is not a detail. The plan face is nine times the frontal one, so on
  // the plain cosine a car flying five degrees nose-up would be charged
  // DOUBLE its end-on drag — a jump that a real car flies through losing a
  // few per cent. Squared, the three weights sum to one, so the area is
  // always a blend of the three faces and never more than the biggest.
  const box =
    A.nose * flow.along * flow.along +
    A.plan * flow.up * flow.up +
    A.side * flow.across * flow.across;
  // The blade, edge-on to the flow that runs along the car (where its drag is
  // already inside the frontal figure) and a full plate to the flow coming
  // through it.
  return (box * spec.aero.slip + spec.aero.wing * A.wingPlate * flow.up * flow.up) * A.bite;
}

/** ...AND THE SPEED THAT AREA WOULD HOLD THE CAR TO, m/s, if it fell at this
 * attitude for ever. Nothing in the model reads it — the drag below is what
 * the car actually feels — but it is the number the labs and the tests check
 * the model against, and the one that can be argued with. */
export function terminalSpeed(spec: CarSpec, cdA: number): number {
  return Math.sqrt((2 * spec.mass * T.air.gravity) / (T.collision.aero.density * cdA));
}

/** WHERE THE BODY'S OWN DRAG ACTS, m behind the weight. The plan face pushes
 * through the middle of the car; `balance` says how far ahead of that middle
 * the weight rides. A nose-heavy car therefore has its air pushing behind its
 * weight, which is a car that noses over as it falls. */
function bodyArm(spec: CarSpec): number {
  return (spec.balance - 0.5) * 2 * B.halfBase;
}

/** THE PITCH THE AIR TRIMS THE BODY TO, rad — positive is nose-up.
 *
 * Added to the arc the nose already follows (`flight.ts`), so a car with
 * nothing hanging off it flies its trajectory exactly as before and a car
 * with a blade on the back flies it nose-high. Clamped by `settlePitch` to
 * `attitude.pitchMax` like every other attitude in the game, and eased onto
 * at the same rate — which is also what keeps the loop between pitch, flow
 * and trim from ringing. */
export function aeroTrim(spec: CarSpec, car: CarState): number {
  const speed = Math.hypot(car.u, car.w, car.vy);
  // Below walking pace there is no flow to trim anything, and the direction
  // of what little there is is noise.
  if (speed < 1) return 0;
  const flow = flowOn(car, speed);
  // Which way the air pushes the body along its OWN up axis, per unit of
  // dynamic pressure and area. Positive is a push UP: the flow running down
  // through the floor in a fall is air the body is displacing upward.
  const plate = -flow.up;
  const body = A.plan * spec.aero.slip * plate;
  const wing = spec.aero.wing * (A.wingPlate * plate - A.wingDown * Math.abs(flow.along));
  // Each at its own lever behind the weight. A push UP behind the weight
  // lifts the tail, which points the nose DOWN — hence the sign on the way
  // out.
  const moment = body * bodyArm(spec) + wing * spec.aero.wingArm;
  const q = 0.5 * T.collision.aero.density * speed * speed;
  // ...against the moment the car's own weight makes at half its length,
  // which is the natural scale to read an attitude off and what keeps this a
  // ratio rather than a raw newton-metre.
  const weight = spec.mass * T.air.gravity * B.halfLength;
  return (-A.trim * (q * moment)) / weight;
}

/** ONE STEP OF THE AIR, on a car that is off the ground: `½·rho·CdA·v²`
 * against the direction of travel, over the car's own mass.
 *
 * It takes from all three components at once, which is the whole point of it
 * being here rather than on `u` alone — a car falling off a cliff is doing
 * almost all of its travelling straight down, and a drag that only ever
 * reached the forward speed would let the fall accelerate without limit.
 *
 * Only ever a loss, at every attitude and every speed, so the crash's ledger
 * (`roll-ledger.ts`) can hold across it: this is a term that may take. */
export function airDrag(spec: CarSpec, car: CarState, dt: number): void {
  const speed = Math.hypot(car.u, car.w, car.vy);
  if (speed < 1e-6) return;
  // `v²` resolved along each axis is `|v|·v_i`, so the whole force is one
  // rate applied to the velocity itself — and a rate rather than a change is
  // what keeps it a strict loss whatever the step size.
  const rate = (T.collision.aero.density * dragArea(spec, car) * speed) / (2 * spec.mass);
  const kept = Math.exp(-rate * dt);
  car.u *= kept;
  car.w *= kept;
  car.vy *= kept;
}
