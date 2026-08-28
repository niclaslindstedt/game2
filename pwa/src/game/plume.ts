// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PLUME — the cloud a car TOWS down a loose stage, as opposed to the
// grit its wheels throw. The two are separate systems because they are
// separate substances: the grit is a few hundred hard grains arcing out of
// the wheel arches and back onto the road inside a second (dust.ts, driven
// from the renderer's wheel logic), and this is the fine stuff the whole
// underside lifts, which does not arc anywhere — it swells, hangs, and is
// dragged along behind the car until the air lets it go.
//
// Presentation only, like everything else in this directory: it reads the
// live `GameState` and never writes a byte of it.
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
  /**
   * Advance the cloud, and add to it if the car is earning any. `ground` is
   * what the surface under the wheels has to hang in the air, or null where
   * it has nothing; `fx` is the effects budget.
   */
  update: (state: GameState, dt: number, fx: number, ground: PlumeGround) => void;
  dispose: () => void;
};

export function createPlume(): Plume {
  const cloud: Dust = createDust(GROUND_CLOUD);
  /** Puffs owed but not yet made. The cloud is written as a RATE, so all
   * but the fastest frames owe a fraction of a puff; rounding each frame
   * on its own would turn a wisp into nothing at all rather than into one
   * puff every few frames. */
  let debt = 0;

  const update = (state: GameState, dt: number, fx: number, ground: PlumeGround): void => {
    cloud.update(dt);
    const car = state.car;
    // Nothing in the air: a car off the ground is not lifting anything off
    // it, and the plume it left is already behind it.
    if (ground === null || fx <= 0 || car.airborne) return;
    const pace = plumeScale(car.u);
    if (pace <= 0) return;

    const rate = PLUME.rate.min + (PLUME.rate.max - PLUME.rate.min) * pace;
    debt += rate * ground.amount * Math.min(dt, PLUME.maxStep) * fx;
    const puffs = Math.floor(debt);
    debt -= puffs;
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

  return { points: cloud.points, update, dispose: cloud.dispose };
}
