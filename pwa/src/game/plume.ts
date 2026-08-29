// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PLUME — the cloud a car TOWS down a loose stage, as opposed to the
// grit its wheels throw. The two are separate systems because they are
// separate substances: the grit is a few hundred hard grains arcing out of
// the wheel arches and back onto the road inside a second (dust.ts, driven
// from the renderer's wheel logic), and this is the fine stuff the whole
// underside lifts, which does not arc anywhere — it swells, hangs, and is
// dragged along behind the car until the air lets it go.
//
// A cloud, and ANY NUMBER OF CARS FEEDING IT. The player's is one instance;
// the field on the road is another, shared by all fourteen crews, because a
// rally where only one car raises dust is a rally with one car in it. What
// makes a cloud one cloud is the pool, not the car: every puff in an
// instance recycles through the same buffer and costs the same single draw,
// so the field's whole entry list is as expensive as the player alone.
// `raise` is therefore per CAR and `step` is per FRAME, and the debt each
// car owes is kept against the car rather than against the cloud (see
// `debts`) — one shared counter would hand a rival the puffs the player
// earned.
//
// Presentation only, like everything else in this directory: it reads live
// `GameState`s and never writes a byte of one.
//
// WHAT DECIDES WHETHER IT COMES UP AT ALL is not here — ground-tint.ts owns
// that call (`plumeGround`), because it is the same module that decides what
// colour a wheel's grit is and the two must never disagree. This module is
// handed a ground or a null, and a null means what is under the car has no
// loose dry dust in it to lift: a sealed road, a wet one where the water has
// bound everything down, or turf, which binds its own soil.

import * as THREE from "three";

import { type GameState } from "@engine";

import {
  AXLE,
  createDust,
  DRIVEN_REAR,
  GROUND_CLOUD,
  PLUME,
  plumeScale,
  type Dust,
} from "./dust.ts";
import { type PlumeGround } from "./ground-tint.ts";

export type Plume = {
  points: THREE.Points;
  /** Age the cloud by one frame. Once per frame per CLOUD, however many
   * cars are feeding it. */
  step: (dt: number) => void;
  /**
   * Add one car's contribution. `ground` is what the surface under ITS
   * wheels has to hang in the air, or null where it has nothing; `fx` is
   * the effects budget. `key` is whatever object identifies the car for as
   * long as it is on the road — the fractional puff it owes is held against
   * it, and let go with it.
   */
  raise: (key: object, state: GameState, dt: number, fx: number, ground: PlumeGround) => void;
  /** Both of the above, for a cloud with exactly one car in it. */
  update: (state: GameState, dt: number, fx: number, ground: PlumeGround) => void;
  dispose: () => void;
};

/**
 * A cloud, and how thick the cars feeding it raise it.
 *
 * `gain` is not a quality setting — it is how much dust a car OTHER than
 * the one being driven is worth. The pool is the cloud's whole budget, so
 * several cars at full rate would recycle each other's puffs and every one
 * of them would end up with a tail a third the length it should have. Below
 * one, a field shares the buffer without any of them tearing holes in
 * anybody's cloud, and a rival two hundred metres up the road — which is
 * where a staggered rally keeps them — is a smudge over the trees rather
 * than a wall, which is exactly what it should be.
 */
export function createPlume(gain = 1): Plume {
  const cloud: Dust = createDust(GROUND_CLOUD);
  /** Puffs owed but not yet made, per car. The cloud is written as a RATE,
   * so all but the fastest frames owe a fraction of a puff; rounding each
   * frame on its own would turn a wisp into nothing at all rather than into
   * one puff every few frames.
   *
   * Weak, because the cars come and go: the field builds a crew's car when
   * they come within range and drops it when the run is over, and a plain
   * Map would hold every entry list the session ever put on the road. */
  const debts = new WeakMap<object, number>();

  const raise = (
    key: object,
    state: GameState,
    dt: number,
    fx: number,
    ground: PlumeGround,
  ): void => {
    const car = state.car;
    // Nothing in the air: a car off the ground is not lifting anything off
    // it, and the plume it left is already behind it.
    if (ground === null || fx <= 0 || car.airborne) return;
    // What the CONTACT PATCH is doing, not what the car is: an axle spun up
    // off the line tears at the ground as hard as a rolling wheel well up
    // the road, and it is the only way a car that has not moved yet gets to
    // hang a cloud over itself. The wheels the plume comes off are the ones
    // `wheelspin` describes (`DRIVEN_REAR` below leans it the same way).
    const pace = plumeScale(Math.abs(car.u) + car.wheelspin * PLUME.spin);
    if (pace <= 0) return;

    const rate = PLUME.rate.min + (PLUME.rate.max - PLUME.rate.min) * pace;
    const debt =
      (debts.get(key) ?? 0) + rate * gain * ground.amount * Math.min(dt, PLUME.maxStep) * fx;
    const puffs = Math.floor(debt);
    debts.set(key, debt - puffs);
    if (puffs <= 0) return;

    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    // THE CARRY, and the whole character of the effect. A puff is handed a
    // fraction of the car's own velocity — signed, so a car being reversed
    // tows its cloud the other way with no second rule for it — and the
    // wind on top. From there the style's drag bleeds it off over about a
    // second, which is what makes the cloud keep up for a moment and then
    // fall away instead of either sitting on the bumper or being left in a
    // line of dots.
    // What every puff leaves the tyre with: the share of the car's own
    // velocity the wake drags it along at, LESS the shove the wheel gives
    // it backward — which is what gets it out from under the car — plus
    // the wind. The drag on the style then bleeds all of it off over the
    // next second, and the cloud stalls and spreads where it was left.
    const carry = car.u * PLUME.follow - PLUME.kick * (0.5 + 0.5 * pace) * Math.sign(car.u || 1);
    const vx = fwdX * carry + state.wind.x * 0.7;
    const vz = fwdZ * carry + state.wind.z * 0.7;
    // WHICH WHEELS: mostly the back ones on every layout, and how much
    // "mostly" is comes off the drivetrain (`DRIVEN_REAR`). The rear axle
    // runs through ground the front has already torn open and the wake that
    // carries a plume sits behind the car, so a rear bias is what the effect
    // is; a front-driver merely wears it a little more lightly.
    const rear = DRIVEN_REAR[state.spec.drive];
    // Spread rides with pace beside the count: a thinned cloud inside an
    // unchanged spread is the same wide cloud with gaps torn in it.
    for (let n = 0; n < puffs; n++) {
      const along = Math.random() < rear ? -AXLE.rear : AXLE.front;
      const side = Math.random() < 0.5 ? -AXLE.side : AXLE.side;
      const jx = (Math.random() * 2 - 1) * PLUME.scatter;
      const jz = (Math.random() * 2 - 1) * PLUME.scatter;
      cloud.spawn(
        car.x + fwdX * along + rightX * side + jx,
        car.y + AXLE.height + Math.random() * PLUME.lift,
        car.z + fwdZ * along + rightZ * side + jz,
        ground.tint,
        1,
        PLUME.spread * pace,
        vx,
        vz,
      );
    }
  };

  /** The one-car cloud, which is what the player's is: the frame's own
   * ageing and the frame's own contribution, off a key that never changes. */
  const solo = {};
  const update = (state: GameState, dt: number, fx: number, ground: PlumeGround): void => {
    cloud.update(dt);
    raise(solo, state, dt, fx, ground);
  };

  return { points: cloud.points, step: cloud.update, raise, update, dispose: cloud.dispose };
}
