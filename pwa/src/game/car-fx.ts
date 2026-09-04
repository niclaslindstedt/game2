// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The transient FX the run throws off: every particle pool the car's
// contact with the world spawns into, plus the weather and the ambient life
// that share their budget. This module owns what the pools ARE, where they
// hang in the scene, how the failing light tints them, and the four-wheel
// burst that a landing or a take-off is.
//
// It owns nothing about WHEN any of it happens: the renderer reads the car
// and the events and decides that, because the decision needs the whole
// frame. What this file removes from the renderer is the bookkeeping —
// a dozen pools to build, add, tint and throw away.

import * as THREE from "three";
import type { GameState } from "@engine";

import { createAmbientLife, type AmbientLife } from "./ambient-life.ts";
import { createCelebration, type Celebration } from "./celebration.ts";
import {
  AXLE,
  createDust,
  MUD,
  SPLASH_WATER,
  TIRE_SMOKE,
  WATER_FOAM,
  type Dust,
  type DustTint,
  CRASH_GRIT,
} from "./dust.ts";
import { createDriftSpray, type DriftSpray } from "./drift-spray.ts";
import { groundTint, plumeGround, type PlumeGround } from "./ground-tint.ts";
import { createPlume, type Plume } from "./plume.ts";
import { createFumes, type Fumes } from "./fumes.ts";
import { rockAt } from "./terrain.ts";

export type CarFx = {
  /** Gravel and grit off the wheels on a dry surface, and the wet road's
   * answer to it — one pool each, so a stage pays for the one it uses. */
  dust: Dust;
  mud: Dust;
  /** The tarmac's own cloud: what the tires give up when the road holds
   * them instead of letting go under them. */
  smoke: Dust;
  /** The towed cloud. Exactly one of it and `mud` is ever shown on a given
   * stage — the weather decides which when the conditions are set — so the
   * pair costs one draw call, not two. */
  plume: Plume;
  /** The rooster tail: the stones a sliding car throws out SIDEWAYS, off
   * the side it is sliding towards, and harder off the axle the drivetrain
   * is spinning. Its own pool because it is its own substance — stones,
   * not grit — and its own module because the throw has a direction the
   * wheel logic's grains do not. */
  gravel: DriftSpray;
  /** The ground a CRASH ploughs up: a body that is no longer on its wheels,
   * grinding along on a corner of its shell. Its own pool rather than the
   * wheel dust's, because a rollover throws more grit in two seconds than a
   * clean stage does in five minutes, and one cloud cannot be both. */
  crash: Dust;
  /** Water the CAR throws, which is a different cloud from the sheet a
   * rolling wheel sprays: the column an entry displaces, and the froth it
   * leaves working on the surface afterwards. */
  spray: Dust;
  foam: Dust;
  fumes: Fumes;
  life: AmbientLife;
  /** The finish's salute. Its clouds live in the scene for the whole run
   * and are empty until the line is crossed — a particle pool costs nothing
   * while it is parked. */
  celebration: Celebration;
  /** The environment's light tint, onto every pool that carries its own
   * baked or vertex colors — and the DARKER one the ground clouds take.
   *
   * Two tints rather than one because a cloud is not a car and does not
   * fail like one (sky.ts's `dustTintFor`): the paint under a night sky has
   * a floor holding it up so the car still reads as a car, and hanging dust
   * has almost none, because a plume at midnight is supposed to be
   * whatever the lamps put back on it. The exhaust and the ambient life
   * keep the car's: a moth is a lit thing and a puff of soot is a solid.
   *
   * `ceiling` is the third thing the sky has to say, and only the ambient
   * life reads it: the cloud base overhead in metres (Infinity when there
   * is none), which decides whether the high traffic above the weather can
   * be seen from under it at all. */
  setTint: (tint: THREE.Color, dust: THREE.Color, ceiling: number) => void;
  /** The ground under the car right now, as a color for whatever is about
   * to be thrown off it. The rock test is deferred: it is a terrain lookup,
   * and only one of the branches ever asks for it. */
  groundDust: (state: GameState, wet: boolean) => number | DustTint;
  /** …and what that same ground gives a cloud that HANGS, which is not the
   * same list: null where there is nothing loose and dry to lift. */
  plumeDust: (state: GameState, wet: boolean) => PlumeGround;
  /** A burst off ALL FOUR contact patches at once — which is what a
   * landing and a take-off are: four tyres meeting or leaving the ground
   * together, not one event in the middle of the car. `total` is the whole
   * burst and each wheel takes a quarter of it, so the count means the same
   * thing it did when this came out of a single point. */
  atWheels: (
    cloud: Dust,
    state: GameState,
    color: number | DustTint,
    total: number,
    spread: number,
  ) => void;
  /** Age every pool the car spawns into by one frame. The ambient life and
   * the salute are driven by the renderer instead: each of them needs
   * something this file does not have. */
  step: (dt: number) => void;
  dispose: () => void;
};

export function createCarFx(scene: THREE.Scene): CarFx {
  const dust = createDust();
  const smoke = createDust(TIRE_SMOKE);
  const plume = createPlume();
  const gravel = createDriftSpray();
  const crash = createDust(CRASH_GRIT);
  const mud = createDust(MUD);
  mud.points.visible = false;
  const spray = createDust(SPLASH_WATER);
  const foam = createDust(WATER_FOAM);
  const fumes = createFumes();
  const life = createAmbientLife();
  const celebration = createCelebration();
  scene.add(
    dust.points,
    crash.points,
    smoke.points,
    plume.points,
    gravel.points,
    mud.points,
    spray.points,
    foam.points,
    fumes.points,
    life.group,
  );
  for (const cloud of celebration.clouds) scene.add(cloud);

  const setTint = (tint: THREE.Color, dustLight: THREE.Color, ceiling: number): void => {
    for (const pool of [dust, crash, smoke, plume, gravel, mud]) {
      (pool.points.material as THREE.PointsMaterial).color.copy(dustLight);
    }
    (fumes.points.material as THREE.PointsMaterial).color.copy(tint);
    life.setSky(tint, ceiling);
  };

  const bareRock = (state: GameState): number =>
    rockAt(state.terrain.groundAt, state.car.x, state.car.z);

  const groundDust = (state: GameState, wet: boolean): number | DustTint =>
    groundTint(state.track.knobs.biome, state.surface, wet, () => bareRock(state));

  const plumeDust = (state: GameState, wet: boolean): PlumeGround =>
    plumeGround(state.track.knobs.biome, state.surface, wet, () => bareRock(state));

  const atWheels = (
    cloud: Dust,
    state: GameState,
    color: number | DustTint,
    total: number,
    spread: number,
  ): void => {
    const c = state.car;
    const fwdX = Math.sin(c.heading);
    const fwdZ = Math.cos(c.heading);
    const rightX = Math.cos(c.heading);
    const rightZ = -Math.sin(c.heading);
    const each = Math.round(total / 4);
    if (each <= 0) return;
    for (const along of [AXLE.front, -AXLE.rear])
      for (const side of [-AXLE.side, AXLE.side])
        cloud.spawn(
          c.x + fwdX * along + rightX * side,
          c.y + AXLE.height,
          c.z + fwdZ * along + rightZ * side,
          color,
          each,
          spread,
        );
  };

  const step = (dt: number): void => {
    dust.update(dt);
    crash.update(dt);
    mud.update(dt);
    smoke.update(dt);
    spray.update(dt);
    foam.update(dt);
    fumes.update(dt);
  };

  const dispose = (): void => {
    for (const pool of [dust, crash, smoke, mud, spray, foam]) pool.dispose();
    plume.dispose();
    gravel.dispose();
    fumes.dispose();
    life.dispose();
    celebration.dispose();
  };

  return {
    dust,
    crash,
    mud,
    smoke,
    plume,
    gravel,
    spray,
    foam,
    fumes,
    life,
    celebration,
    setTint,
    groundDust,
    plumeDust,
    atWheels,
    step,
    dispose,
  };
}
