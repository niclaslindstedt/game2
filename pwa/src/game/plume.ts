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
// WHAT DECIDES WHETHER IT COMES UP AT ALL is not here — the renderer owns
// that call, because it is the same call that decides what colour a wheel's
// grit is, and the two must never disagree. This module is handed a tint or
// a null, and a null means the ground under the car has nothing to give:
// a sealed road, which has nothing lying on it, or a wet one, where the
// water has bound down everything that would otherwise fly.

import * as THREE from "three";

import { type GameState } from "@engine";

import {
  AXLE,
  createDust,
  DRIVEN_REAR,
  GROUND_CLOUD,
  PLUME,
  plumeScale,
  WILD_THROW,
  type Dust,
  type DustTint,
} from "./dust.ts";

export type Plume = {
  points: THREE.Points;
  /**
   * Advance the cloud, and add to it if the car is earning any. `tint` is
   * what the ground under the wheels is made of, or null where it gives up
   * nothing at all; `fx` is the effects budget.
   */
  update: (state: GameState, dt: number, fx: number, tint: number | DustTint | null) => void;
  dispose: () => void;
};

export function createPlume(): Plume {
  const cloud: Dust = createDust(GROUND_CLOUD);
  /** Puffs owed but not yet made. The cloud is written as a RATE, so all
   * but the fastest frames owe a fraction of a puff; rounding each frame
   * on its own would turn a wisp into nothing at all rather than into one
   * puff every few frames. */
  let debt = 0;

  const update = (
    state: GameState,
    dt: number,
    fx: number,
    tint: number | DustTint | null,
  ): void => {
    cloud.update(dt);
    const car = state.car;
    // Nothing in the air: a car off the ground is not lifting anything off
    // it, and the plume it left is already behind it.
    if (tint === null || fx <= 0 || car.airborne) return;
    const pace = plumeScale(car.u);
    if (pace <= 0) return;

    // Turf holds together where a graded road does not: a wheel off the
    // road tears out clods, it does not lift a screen of dust — so the
    // wild gets the same cloud at the same cut the grit takes out there.
    const ground = state.surface === "nature" ? WILD_THROW : 1;
    const rate = PLUME.rate.min + (PLUME.rate.max - PLUME.rate.min) * pace;
    debt += rate * ground * Math.min(dt, PLUME.maxStep) * fx;
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
    // WHICH WHEELS: the driven ones, and only those. An undriven wheel
    // rolls over the surface and leaves it where it was; a driven one
    // tears it out, and the cloud is what it tore out. So the car's
    // layout picks the axle — and a front-driver's plume coming forward
    // from under its nose is the most visible difference there is between
    // the two layouts from behind the car.
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
        tint,
        1,
        PLUME.spread * pace,
        vx,
        vz,
      );
    }
  };

  return { points: cloud.points, update, dispose: cloud.dispose };
}
