// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE CAR STANDS. The wheels follow the ground; this module says which
// ground, how, and what the body is told about it. One rule for the road and
// the country alike — the height is read where the car has just moved TO,
// never carried forward from where it was — so the seam between the two is a
// place the car drives over rather than a step it is dropped down. Three
// things the ground can do to the car come out of here: it can fall away
// (an edge, and the car flies), it can rise faster than the wheels can
// climb (a face, and the contact model has it), and it can simply be uneven
// (a bump, which goes to the springs). The numbers are in defs/tuning.ts.
//
// The car's smoothed vertical speed (`car.vy`, off the grade read over a
// wheelbase) is what the attitude, the camera and the landings read; the
// speed the wheels ACTUALLY moved at this step is `car.wheelVy`, and the
// difference between the two is what a bump is.

import { clamp } from "../lib/math.ts";
import { collideSlope } from "./collision.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarState, GameEvent, RunStats } from "./state.ts";

const T = TUNING;

/** The ground a step is settled against: a height reader over world
 * position, whether it is the open lattice (`wild`) or a road profile — the
 * distinction is only the SEAT, see `readSeat` — and the height it stood at
 * under the car's middle as the step began, which is what the wheels'
 * vertical speed is measured from. */
export type GroundUnder = {
  groundAt: (x: number, z: number) => number;
  wild: boolean;
  /** Ground elevation under the car before this step's move. */
  groundY: number;
};

/** Where the car stands now: `centre` is the ground under its middle, `seat`
 * the height its body sits at. On the lattice the seat is lifted over the
 * whole footprint (`seatOn`); on a road it IS the centre — a road is built
 * smooth across the body's own length, and the cross-section under the
 * wheels (a rut, the crown, the shoulder) is what the car is SUPPOSED to
 * ride, not a face to be lifted clear of. */
export type Seat = { centre: number; seat: number };

/**
 * WHERE A CAR STANDS ON UNEVEN GROUND — the height of the plane its own
 * body sits on, rather than the height of the one point under its middle.
 *
 * `car.y` is the ground under the car and everything drawn hangs off it at
 * the attitude the ground asked for, so reading it at the centre alone is
 * only honest where the ground is flat under the whole footprint. Out in the
 * wild it is not: a hillside steeper than `attitude.pitchMax`, the crease
 * where two lattice triangles meet, the foot of a cut bank — all of them
 * leave one end of the car metres under the surface the renderer draws, and
 * a car buried to its roof is what the player sees.
 *
 * So the body's four corners are sampled and the plane is LIFTED until none
 * of them is below the ground: the seat is the highest a corner asks for,
 * measured against where that corner sits under the attitude the car is
 * already holding. Flat ground gives back the centre height exactly, which
 * is why this is safe to run everywhere off the road.
 *
 * A corner over ground that rises harder than `collision.climbLimit` is not
 * standing on it, it is up against a WALL — and a wall pushes a car back, it
 * does not hold its nose in the air. So the rise a corner may claim is capped
 * at the grade the wheels could have climbed to get there, which is the same
 * line the ground-as-a-solid check draws; past it the contact model has the
 * car, not this.
 *
 * Exported because anything that PUTS a car on open ground — the beaching at
 * the end of a drowning, in step.ts — owes it the same seat the driving model
 * would have given it. Dropping a car at the bare centre height instead
 * leaves it a body-corner under the surface, and the wall check on the next
 * step reads that as a face and hits the car with it.
 */
export function seatOn(
  car: CarState,
  centre: number,
  ground: (x: number, z: number) => number,
): number {
  const hl = T.collision.halfLength;
  const hw = T.collision.halfWidth;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // The body's own rise at a corner: the nose lifts with pitch, the right
  // side with roll — the same two angles the renderer draws the body at.
  const risePitch = Math.sin(car.pitch);
  const riseRoll = Math.sin(car.roll);
  let seat = centre;
  for (const lz of [hl, -hl]) {
    for (const lx of [hw, -hw]) {
      // Forward is (sin h, cos h) and right is (cos h, -sin h).
      const x = car.x + sinH * lz + cosH * lx;
      const z = car.z + cosH * lz - sinH * lx;
      const reach = Math.hypot(lz, lx) * T.collision.climbLimit;
      const rise = Math.min(ground(x, z), centre + reach);
      const plane = rise - (lz * risePitch + lx * riseRoll);
      if (plane > seat) seat = plane;
    }
  }
  return seat;
}

/** Read where the car stands now (see `Seat`). */
export function readSeat(car: CarState, under: GroundUnder): Seat {
  const centre = under.groundAt(car.x, car.z);
  return { centre, seat: under.wild ? seatOn(car, centre, under.groundAt) : centre };
}

/** The vertical speed the WHEELS moved at over this step, m/s: what the
 * ground under the car's middle did along the path it covered. Measured
 * from the centre and never from the seat, because the seat also moves when
 * the body's attitude settles or a corner finds a rise — and that is the
 * body being lifted, not the wheels going up. */
export function wheelSpeed(under: GroundUnder, centre: number): number {
  return (centre - under.groundY) / T.dt;
}

/** The car meeting a face it cannot climb. Reads the ground's gradient at
 * the bumper — that direction is the contact normal — hands the contact to
 * collision.ts, and backs the car out of however much of the step the face
 * refused. A wall gives the whole step back (the car stops against it and
 * the wedge rule in step.ts eventually fetches it); a steep bank gives some
 * of it back and the car scrabbles up the rest. */
function hitFace(
  spec: CarSpec,
  car: CarState,
  ground: (x: number, z: number) => number,
  faceSlope: number,
  fromX: number,
  fromZ: number,
  events: GameEvent[],
  stats: RunStats,
): void {
  const span = T.collision.faceSpan;
  const gradient = {
    x: (ground(car.x + span, car.z) - ground(car.x - span, car.z)) / (2 * span),
    z: (ground(car.x, car.z + span) - ground(car.x, car.z - span)) / (2 * span),
  };
  const bite = collideSlope(spec, car, faceSlope, gradient, events, stats);
  if (bite <= 0) return;
  car.x -= (car.x - fromX) * bite;
  car.z -= (car.z - fromZ) * bite;
}

/**
 * Put the car on the ground where it has just moved to. `at` is what
 * `readSeat` read there before this was called; `roadVy` is the smoothed
 * vertical speed the grade asks for, which is what `car.vy` is set to.
 *
 * Two things happen on the way. The ground can be a WALL: how far it rose
 * over the ground the car just covered IS the face's grade, read exactly
 * where the bumper is rather than over the wide baseline the grade term
 * uses — a cliff is metres wide, and a smoothed slope would let the car
 * drive up the side of a mountain at pace. Past `collision.climbLimit` the
 * contact model refuses part of the step and the seat is read again where
 * the car was left. And whatever the ground did, the WHEELS did it: the
 * speed they actually moved at this step (`wheelSpeed`), against the speed
 * the smoothed grade predicted, is written to `car.wheelVy` for the springs
 * — see `groundJolt`.
 */
export function standOn(
  spec: CarSpec,
  car: CarState,
  under: GroundUnder,
  at: Seat,
  fromX: number,
  fromZ: number,
  roadVy: number,
  events: GameEvent[],
  stats: RunStats,
): void {
  const run = Math.hypot(car.x - fromX, car.z - fromZ);
  if (run > 1e-4 && at.seat - car.y > run * T.collision.climbLimit) {
    hitFace(spec, car, under.groundAt, (at.seat - car.y) / run, fromX, fromZ, events, stats);
    // The contact gave part of the step back, so the car is no longer
    // standing where the seat above was measured.
    at = readSeat(car, under);
  }
  car.y = at.seat;
  // Attitude from the smoothed grade: the raw per-step height delta would
  // pitch-jitter the nose over every ripple of noise.
  car.vy = roadVy;
  car.wheelVy = wheelSpeed(under, at.centre);
}

/**
 * WHAT THE GROUND JUST DID TO THE SPRINGS, m/s of wheel speed change — the
 * one number `stepSuspension` is excited by. Two channels, because the
 * ground does two different things and a single cap cannot serve both.
 *
 * The SHAPE — a valley floor, a brow, a bank — arrives through the smoothed
 * grade (`car.vy` against the step before), and it is capped at
 * `suspension.joltMax`: a valley floor at pace is several g held for a fifth
 * of a second, no spring soft enough to feel like a rally car holds a body
 * against that inside a wheel arch, and past the cap the dampers are out of
 * authority and the whole car rides the ground up, which is what a bottomed
 * suspension does.
 *
 * The BUMP — a kerb, the step off the mat onto the shoulder, the crease
 * where two lattice triangles meet, the face of a jump met from behind — is
 * everything the smoothed grade did NOT predict: the change, step to step,
 * in how far the wheels' real speed ran ahead of the smoothed one. It is a
 * spike by nature (the grade catches up over the next few metres and the
 * residual unwinds, so the channel sums to nothing over a transient) and it
 * carries its own ceiling, `suspension.bumpMax`, sized so the worst kerb in
 * the game squats the body onto its stops and no further. Without this
 * channel the shape cap swallowed every step in the ground along with the
 * shapes it was written for, and a car crossing a verge at pace moved on
 * its springs by nothing at all — the read that made the car look bolted
 * to the road.
 *
 * `prevVy` and `prevWheelVy` are the two speeds as the step began.
 */
export function groundJolt(car: CarState, prevVy: number, prevWheelVy: number): number {
  const S = T.suspension;
  const joltCap = S.joltMax * T.dt;
  const shape = clamp(car.vy - prevVy, -joltCap, joltCap);
  const bump = clamp(car.wheelVy - car.vy - (prevWheelVy - prevVy), -S.bumpMax, S.bumpMax);
  return shape + bump;
}
