// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROOSTER TAIL — the stones a sliding car throws SIDEWAYS, off the side
// it is sliding towards. It is a third substance beside the grit the wheel
// arches scatter (dust.ts, from the renderer's wheel logic) and the fine
// cloud the underside tows (plume.ts): those two come off the car in the
// direction it is travelling, and this one comes off it in the direction
// it is SLIDING, which on a car with any angle on it is a different
// direction, and is the whole of the picture a drift makes from outside.
//
// This file is the DRAWN half: the pool the stones live in, where each one
// is born on the car, and the direction and speed it leaves at. WHICH wheel
// throws it, and how hard, is `drift-throw.ts` — every knob the tail is
// tuned by is in `DRIFT_SPRAY` there, and the per-wheel arithmetic in
// `wheelThrow` beside it, kept DOM-free so the tests can read it.
//
// Presentation only: reads a live `GameState`, writes nothing back, and
// draws its jitter from `Math.random` — the sim never reads any of it.

import * as THREE from "three";

import { type GameState } from "@engine";

import {
  DRIFT_SPRAY,
  type Patch,
  PATCHES,
  ramp,
  STONE_LIFE,
  STONE_POOL,
  wheelThrow,
} from "./drift-throw.ts";
import { AXLE, createDust, type Dust, type DustStyle, type DustTint } from "./dust.ts";

/** THE STONES, as matter. Bigger than a grain of the grit the arches
 * scatter and heavier: a stone flung off a sliding tyre keeps its speed and
 * comes down hard rather than hanging. No `rise` of its own and almost no
 * `updraft` — the throw's elevation is `DRIFT_SPRAY.pitch`'s business, and a
 * style that lifted them as well would be a second, hidden angle knob.
 * Capped on screen: the tail streams stones past the chase camera all
 * corner long, and an uncapped sprite going by the lens is a square a hand
 * across for a frame. */
export const DRIFT_STONES: DustStyle = {
  size: 0.09,
  opacity: 1,
  rise: 0,
  gravity: 11,
  updraft: 0.25,
  pixelCap: 0.028,
  life: STONE_LIFE,
  /** The tail tears a hole in itself at exactly the moment it is thickest
   * if the pool recycles a stone that has not landed, so the size is
   * derived rather than chosen — see `STONE_POOL`. */
  pool: STONE_POOL,
};

export type DriftSpray = {
  points: THREE.Points;
  /**
   * One frame: age the stones in the air, then throw this frame's share.
   * `fx` is the effects budget, `amount` how much the ground under the car
   * gives up as a share of a dry gravel road (0 for a sealed one, which
   * throws nothing, above 1 for a soaked one), and `color` what it is
   * coloured — read only once a stone is actually owed, so a car on grip
   * never pays for the terrain lookup behind it.
   */
  update: (
    state: GameState,
    dt: number,
    fx: number,
    amount: number,
    color: () => number | DustTint,
  ) => void;
  dispose: () => void;
};

export function createDriftSpray(): DriftSpray {
  const cloud: Dust = createDust(DRIFT_STONES);
  /** Stones owed but not yet thrown — the fraction a frame's rate leaves. */
  let debt = 0;
  /** Per-wheel throw weights for the frame, filled by `wheelThrow` and
   * kept here so a frame of spawning allocates nothing. */
  const weights = new Float64Array(PATCHES.length);
  /** The frame's stone colour, rewritten in place: spawning runs many
   * times a second and a fresh object each time is garbage the collector
   * answers with a pause mid-corner. */
  const shade = new THREE.Color();
  const stones: DustTint = { base: 0, fleck: 0, fleckMix: 0 };

  const update = (
    state: GameState,
    dt: number,
    fx: number,
    amount: number,
    color: () => number | DustTint,
  ): void => {
    cloud.update(dt);
    const car = state.car;
    if (fx <= 0 || amount <= 0 || car.airborne) return;
    const K = DRIFT_SPRAY;
    // WHICH WAY THE TAIL IS GOING: `w` is the car's sideways speed along
    // its own right axis, so its sign is the side the stones come off and
    // its size is how hard the tyres are being dragged across the ground.
    const scrub = Math.abs(car.w);
    const slide = ramp(car.slide, K.slide.from, K.slide.full);
    const dig = ramp(scrub, K.scrub.from, K.scrub.to);
    const pace = ramp(Math.abs(car.u), K.speed.from, K.speed.to);
    const strength = slide * dig * pace;
    if (strength <= 0) {
      debt = 0;
      return;
    }

    // Which wheels, and how much each: the drivetrain's axle shares, the
    // leading side over the one running in its furrow, and the power going
    // through whichever axle the engine turns.
    const lit = ramp(car.wheelspin, K.spin.from, K.spin.lit);
    const drivenRear = state.spec.drive !== "fwd";
    const drivenFront = state.spec.drive !== "rwd";
    const leading = Math.sign(car.w || 1);
    const total = wheelThrow(state.spec.drive, { leading, dig, lit, spun: car.spun }, weights);
    if (total <= 0) return;

    debt += K.rate * strength * total * amount * fx * Math.min(dt, K.maxStep);
    const count = Math.floor(debt);
    debt -= count;
    if (count <= 0) return;

    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    // THE THROW, in the car's frame. Sideways: the tyre's own scrub, flicked
    // a little harder than the tyre moves and capped. Along: the share of
    // the car's speed a stone keeps, LESS the kick a lit axle fires it
    // backward with — so the tail leans back on the power and fans straight
    // out off a slide that is only being steered.
    const flung = Math.min(K.fling.max, scrub * K.fling.gain) * leading;
    const carry = car.u * K.wake;
    // The ground's own tint, darkened into stone, with the ground's pale
    // grit left through it grain by grain. A two-tone ground (turf over
    // earth, wet clods) keeps its fleck and only darkens its body.
    const ground = color();
    const body = typeof ground === "number" ? ground : ground.base;
    stones.base = shade.set(body).multiplyScalar(K.shade).getHex();
    stones.fleck = typeof ground === "number" ? ground : ground.fleck;
    stones.fleckMix = typeof ground === "number" ? K.grit : ground.fleckMix;
    for (let n = 0; n < count; n++) {
      // Pick the wheel by weight — one draw walked down the table.
      let pick = Math.random() * total;
      let i = 0;
      while (i < PATCHES.length - 1 && (pick -= weights[i] as number) > 0) i++;
      const wheel = PATCHES[i] as Patch;
      // Where that patch sits along the car — the geometry the throw's own
      // half has no use for and therefore does not carry.
      const axleAt = wheel.rear ? -AXLE.rear : AXLE.front;
      const driven = wheel.rear ? drivenRear : drivenFront;
      const back = driven ? K.kick * lit : 0;
      // Horizontal throw in the car's frame, then fanned about its own
      // direction by a random angle either side.
      const along = carry - back;
      const across = flung;
      const turn = (Math.random() * 2 - 1) * K.fan;
      const cosT = Math.cos(turn);
      const sinT = Math.sin(turn);
      const tAlong = along * cosT - across * sinT;
      const tAcross = along * sinT + across * cosT;
      // Elevation off the flung speed (what the tread put into the stone),
      // not off the carry: a stone keeping pace with the car is not being
      // thrown UP by anything.
      const pitch = K.pitch + (Math.random() * 2 - 1) * K.pitchVary;
      const up = (Math.abs(flung) + back) * Math.tan(Math.max(0.05, pitch));
      const sx = car.x + fwdX * axleAt + rightX * (wheel.side * AXLE.side + leading * K.out);
      const sz = car.z + fwdZ * axleAt + rightZ * (wheel.side * AXLE.side + leading * K.out);
      cloud.spawn(
        sx,
        car.y + AXLE.height + K.lift,
        sz,
        stones,
        1,
        K.scatter,
        fwdX * tAlong + rightX * tAcross,
        fwdZ * tAlong + rightZ * tAcross,
        up,
      );
    }
  };

  return { points: cloud.points, update, dispose: cloud.dispose };
}
