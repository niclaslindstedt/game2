// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE FRONT WHEELS ARE POINTED, stated once and kept DOM-FREE.
//
// The engine hands over `CarInput.steer` — a stick position, -1..1, and not
// an angle. Turning that into the angle a front wheel actually sits at is a
// presentation decision, so it lives here in `pwa/` rather than in the
// handling model. But it is NOT only the drawn wheel's business, and that
// is the whole reason this is its own module:
//
//   * `car-mesh.ts` turns the wheels and the steering rim by it.
//   * `snow-marks.ts` needs it to know how far off its own heading a front
//     tyre is travelling, because that angle is what decides how wide a
//     band it smears into the snow and whether the tread prints at all
//     (`bandHalf`). In a caught slide the driver has the fronts turned INTO
//     the drift, so they run far truer than the rears — which is a thing
//     you can see in the snow, and only if both modules agree about where
//     the wheels are pointed.
//
// A second copy of the lock would be a car whose ruts disagree with its own
// front wheels. Reading it off `car-mesh.ts` instead is what this module
// exists to avoid: that module builds the body, and the body is made of
// canvas textures, so importing it from anywhere drags `document` into the
// root typecheck's program — which has no DOM, because it is the one that
// checks the ENGINE and the tests. Kept here with nothing but arithmetic
// in it, anything may read it.

/** Radians of front-wheel angle at full lock. */
export const WHEEL_STEER_LOCK = 0.55;
/** ...hard-clamped here, rad — past this the wheels read as broken. */
const WHEEL_STEER_MAX = 0.7;
/** How fast the drawn wheels chase the input, 1/s — quick enough to read as
 * the driver's hands, slow enough not to strobe on per-step input. */
const WHEEL_STEER_RATE = 14;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The angle a front wheel is ASKED for by a given stick position, rad. */
export function wheelSteerAt(steer: number): number {
  return clamp(steer * WHEEL_STEER_LOCK, -WHEEL_STEER_MAX, WHEEL_STEER_MAX);
}

/** ...and where the DRAWN wheel has got to, `dt` on from `now`, chasing it.
 * The drawn wheel lags the input by a fraction of a second on purpose: that
 * lag is the driver's hands, and without it a per-step input strobes. */
export function wheelSteerChase(now: number, steer: number, dt: number): number {
  return now + (wheelSteerAt(steer) - now) * clamp(WHEEL_STEER_RATE * dt, 0, 1);
}
