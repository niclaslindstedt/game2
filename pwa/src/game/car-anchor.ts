// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE A THING BOLTED TO THE CAR IS, in world axes — the arithmetic behind
// every effect that leaves the car from a fixed place ON it rather than from
// its middle: the exhaust off each tailpipe, the steam off the engine bay.
//
// The car is drawn heading, then roll, then pitch (`car-mesh.ts`), about an
// origin that sits on the wheel-contact plane under its middle. An effect
// placed off the HEADING alone agrees with that only while the car is level,
// and the one moment the player is watching the car hardest is the one moment
// it is not. A car on its roof is held a hull's height in the air by its own
// shell (`rollStand`), so its floor is ABOVE that origin instead of below it,
// its right-hand pipe is out to the left, and the pipe that pointed at the
// road is pointing at the sky. Smoke placed off the heading comes out of the
// air beside the wreck, on the wrong side and a car's height too high.
//
// Neither three.js nor the DOM, for `crash-throw.ts`'s reason: the claim is
// arithmetic, and a picture of a car in the middle of an accident cannot be
// held to a puff being a metre out. `tests/car_anchor_test.ts` can.

/** A point fixed to the car's shell, m in the car's OWN axes: `along` toward
 * the nose, `across` to its right, `up` from the origin the car is drawn
 * about. The origin is the wheel-contact plane under the middle of the car,
 * so the body's floor is a small positive `up` and anything slung under it
 * (a tailpipe) is smaller still. */
export type BodyPoint = { along: number; across: number; up: number };

/** ...and a direction or an offset in world axes. An OFFSET from the car's
 * origin, never a position: the caller adds `car.x`/`car.y`/`car.z`, which is
 * what lets the same function place a point and aim a pipe. */
export type WorldVec = { x: number; y: number; z: number };

/**
 * Turn one into the other, for a car at `heading` (rad, world), `roll` and
 * `pitch` (rad, the engine's own, both as `CarState` carries them).
 *
 * `out` is written in place and handed back. A pipe at the limiter fires
 * sixty times a second out of every exit it has, and a vector allocated per
 * puff is a frame the collector comes back for.
 */
export function bodyOffset(
  at: BodyPoint,
  heading: number,
  roll: number,
  pitch: number,
  out: WorldVec,
): WorldVec {
  // The order is the renderer's, and it has to stay the renderer's: the
  // pitch is innermost (`body.group.rotation.x`), the roll around that
  // (`.rotation.z`), and the heading outermost, on the group the whole car
  // hangs off. Rolling before pitching puts a car that is over AND nose-down
  // somewhere neither the model nor the physics agrees with.
  //
  // A nose-up pitch is a NEGATIVE rotation about the local +x, which is the
  // same sign convention `car-mesh.ts` states and the reason the pitch terms
  // below read inverted.
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y1 = at.up * cp + at.along * sp;
  const z1 = at.along * cp - at.up * sp;

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const x2 = at.across * cr - y1 * sr;
  const y2 = at.across * sr + y1 * cr;

  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  out.x = x2 * ch + z1 * sh;
  out.y = y2;
  out.z = z1 * ch - x2 * sh;
  return out;
}
