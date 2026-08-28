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
// eleven pools to build, add, tint and throw away.

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
} from "./dust.ts";
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
   * baked or vertex colors. */
  setTint: (tint: THREE.Color) => void;
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
  const mud = createDust(MUD);
  mud.points.visible = false;
  const spray = createDust(SPLASH_WATER);
  const foam = createDust(WATER_FOAM);
  const fumes = createFumes();
  const life = createAmbientLife();
  const celebration = createCelebration();
  scene.add(
    dust.points,
    smoke.points,
    plume.points,
    mud.points,
    spray.points,
    foam.points,
    fumes.points,
    life.group,
  );
  for (const cloud of celebration.clouds) scene.add(cloud);

  const setTint = (tint: THREE.Color): void => {
    for (const pool of [dust, smoke, plume, mud, fumes]) {
      (pool.points.material as THREE.PointsMaterial).color.copy(tint);
    }
    life.setTint(tint);
  };

  const bareRock = (state: GameState): number =>
    rockAt(state.terrain.groundAt, state.car.x, state.car.z);

  const groundDust = (state: GameState, wet: boolean): number | DustTint =>
    groundTint(state.surface, wet, () => bareRock(state));

  const plumeDust = (state: GameState, wet: boolean): PlumeGround =>
    plumeGround(state.surface, wet, () => bareRock(state));

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
    mud.update(dt);
    smoke.update(dt);
    spray.update(dt);
    foam.update(dt);
    fumes.update(dt);
  };

  const dispose = (): void => {
    for (const pool of [dust, smoke, mud, spray, foam]) pool.dispose();
    plume.dispose();
    fumes.dispose();
    life.dispose();
    celebration.dispose();
  };

  return {
    dust,
    mud,
    smoke,
    plume,
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
