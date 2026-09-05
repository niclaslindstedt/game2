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
import { climbGrade } from "./limits.ts";
import type { CarState, GameEvent, RunStats } from "./state.ts";
import type { Rng } from "../lib/prng.ts";
import type { Surface } from "../mapgen/index.ts";

const T = TUNING;

/** The ground a step is settled against: a height reader over world
 * position, how much of what the car is standing on is open COUNTRY rather
 * than road — the distinction is only the SEAT, see `readSeat` — and the
 * height it stood at under the car's middle as the step began, which is
 * what the wheels' vertical speed is measured from.
 *
 * `groundAt` is ONE surface across the whole world, road and country alike
 * (step.ts builds it): the seam at the verge is a place the car drives over
 * and never a step between two readers, because a step in the ground is a
 * height difference divided by `dt`, and at 120 Hz that is tens of m/s of
 * ground apparently falling out from under a car that is merely driving off
 * a road. */
export type GroundUnder = {
  groundAt: (x: number, z: number) => number;
  /** 0 where the car stands on the road's own ribbon, 1 out in the country,
   * ramped across the verge between them. */
  country: number;
  /** Ground elevation under the car before this step's move. */
  groundY: number;
};

/** Where the car stands now: `centre` is the ground under its middle, `seat`
 * the height its body sits at, and `foot` the mean ground under its four
 * wheels. On the lattice the seat is lifted over the whole footprint
 * (`seatOn`); on a road it IS the centre — a road is built smooth across
 * the body's own length, and the cross-section under the wheels (a rut, the
 * crown, the shoulder) is what the car is SUPPOSED to ride, not a face to
 * be lifted clear of. The foot is what the BODY rides: one wheel dropping
 * into a rut moves it by a quarter of the rut, and a shape shorter than
 * the wheelbase is under one axle at a time. It is the ground the body's
 * own momentum is measured against (car.ts, `loft`). */
/** Everything a step needs to know about the ground: the height under any
 * world position and whether it is the open lattice or a road profile
 * (`GroundUnder`, ground.ts), plus the grade and shape already read under
 * the car and the weather over it. */
export type GroundContext = GroundUnder & {
  surface: Surface | "nature";
  /** Road slope dy/ds under the car... */
  slope: number;
  /** Ground slope ACROSS the heading, positive when the ground rises to
   * the car's right — what pulls a car toward the downhill side. Off the
   * road it is the hillside; on the road it is the camber and the worn
   * wheel tracks (road.ts). Absent means dead flat. */
  slopeLat?: number;
  /** Vertical curvature of the road under the car, 1/m — negative over a
   * brow. Zero anywhere a jump lip owns the launch. */
  roadCurve: number;
  /** True within `air.crestSpan` of a jump lip on the road (step.ts). The
   * lip owns the launch there: the body's lift is read off the ground
   * under the middle, because the footprint's mean plunges as the front
   * wheels go over two metres before the middle does. */
  lip?: boolean;
  /** Current wind velocity, world space m/s. */
  windX: number;
  windZ: number;
  t: number;
  rng: Rng;
  /** What the drive is multiplied by this step — 1 everywhere except inside
   * a mass start's catch-up, where a car giving away grid rows is given back
   * the metres (state.catchUp). It multiplies the engine's pull and nothing
   * else: the grip, the slide and the top end are all still the car's. */
  drive: number;
};

export type Seat = { centre: number; seat: number; foot: number };

/** The grade the wheels carry THIS car onto right now — off its ground
 * speed, the momentum a bank is taken with (`climbGrade`). */
function climbNow(car: CarState): number {
  return climbGrade(Math.hypot(car.u, car.w));
}

/** The four wheel positions' ground, read at the car's heading: the plane
 * they ask the body to sit on (`seat`, see `seatOn`) and their mean
 * (`foot`). A wheel only ever PUSHES: one whose ground has fallen further
 * below the middle than any hill the car could be standing on would put
 * it (`climb` over its distance) plus the wheels' reach (`air.loft`)
 * is hanging in the air and says nothing about where the body is, so it
 * counts at the end of its reach — the nose going over an edge leaves the
 * body riding the rear axle, not diving after the fronts. Measured from
 * the MIDDLE's ground and never from the body's attitude: a car that has
 * just come down on a steep face carries the flight's pitch for a beat,
 * and a clamp read off that plane lofted it straight back off the face. */
function corners(
  car: CarState,
  centre: number,
  ground: (x: number, z: number) => number,
  climb: number,
): { seat: number; foot: number } {
  const hl = T.collision.halfLength;
  const hw = T.collision.halfWidth;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // The body's own rise at a corner: the nose lifts with pitch, the right
  // side with roll — the same two angles the renderer draws the body at.
  const risePitch = Math.sin(car.pitch);
  const riseRoll = Math.sin(car.roll);
  let seat = centre;
  let foot = 0;
  for (const lz of [hl, -hl]) {
    for (const lx of [hw, -hw]) {
      // Forward is (sin h, cos h) and right is (cos h, -sin h).
      const x = car.x + sinH * lz + cosH * lx;
      const z = car.z + cosH * lz - sinH * lx;
      const under = ground(x, z);
      const reach = Math.hypot(lz, lx) * climb;
      // A corner against a WALL — ground rising harder than the wheels
      // could climb — is not standing on it either, so it counts at the top
      // of its reach in the foot as it does in the seat, and the wall's own
      // slope never becomes a speed the wheels are moving at.
      const rise = Math.min(under, centre + reach);
      foot += Math.max(rise, centre - reach - T.air.loft);
      const plane = rise - (lz * risePitch + lx * riseRoll);
      if (plane > seat) seat = plane;
    }
  }
  return { seat, foot: foot / 4 };
}

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
 * A corner over ground that rises harder than the wheels carry the car at
 * its speed (`climbGrade` — `collision.climbLimit` from a crawl, up to
 * `wallSlope` at pace) is not standing on it, it is up against a WALL — and
 * a wall pushes a car back, it does not hold its nose in the air. So the
 * rise a corner may claim is capped at the grade the wheels could have
 * climbed to get there, which is the same line the ground-as-a-solid check
 * draws; past it the contact model has the car, not this.
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
  return corners(car, centre, ground, climbNow(car)).seat;
}

/** The mean ground under the four wheels, at the car's heading — what the
 * body rides (see `Seat.foot`). Read on its own where the car has just
 * arrived from the air, so the first grounded step has a foot to measure
 * the wheels' speed from. */
export function footOn(car: CarState, ground: (x: number, z: number) => number): number {
  return corners(car, ground(car.x, car.z), ground, climbNow(car)).foot;
}

/** PUT A CAR DOWN: the foot the first grounded step measures its wheels'
 * speed from, read now so that step sees wheels that have not moved rather
 * than a foot that fell the whole cross-section of the ground in one step
 * — which is a body lifting off its wheels on the grid, and tyres carrying
 * less than the car's weight into the launch. Everything that places a car
 * on the ground owes it this (the grid, a respawn, the beaching at the end
 * of a drowning). */
export function plant(car: CarState, ground: (x: number, z: number) => number): void {
  car.foot = footOn(car, ground) - ground(car.x, car.z);
  car.footVy = 0;
  car.footMean = 0;
  car.loft = 0;
  car.loftRate = 0;
}

/** Read where the car stands now (see `Seat`).
 *
 * The corner lift comes in with the COUNTRY (`GroundUnder.country`) rather
 * than switching on at the verge line. On the mat there is none: a road is
 * built smooth across the body's length, and a car seated on its own crown
 * would ride a hand's width high on every stage. Out in the country it is
 * whole. Switched at the line instead, the lift arrived all at once — up to
 * a third of a metre of body, in one step, upward, on a car driving off a
 * road — which is the ONE thing a car leaving a road must never do. */
export function readSeat(car: CarState, under: GroundUnder): Seat {
  const centre = under.groundAt(car.x, car.z);
  const { seat, foot } = corners(car, centre, under.groundAt, climbNow(car));
  return { centre, seat: centre + (seat - centre) * under.country, foot };
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
 * drive up the side of a mountain at pace. Past the grade the car's own
 * speed carries it onto (`climbGrade`) the contact model refuses part of
 * the step and the seat is read again where the car was left. And
 * whatever the ground did, the WHEELS did it: the
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
  if (run > 1e-4 && at.seat - car.y > run * climbNow(car)) {
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
