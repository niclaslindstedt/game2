// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRONE — high above and behind, trailing the car and circling it
// slowly. It is the menu's living backdrop: a bot is driving a real stage
// under the cards, and nobody is watching the apex. Nothing is ever driven
// from here, which is why it is not on the ladder the camera key walks and
// why it carries none of the chase rigs' machinery — no drift framing, no
// swing spring, no floor, no cliff.
//
// What it does carry is MOVEMENT for its own sake. The yaw follows the nose
// far more lazily than a chase camera's does — a drone has mass and a pilot,
// and a camera at this altitude that snapped to every corner would read as a
// map scrolling rather than as something flying — and the circling and the
// altitude breathe are what stop a menu backdrop from looking like a paused
// screenshot.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

/** How far to the side the drone flies, m. The menu's cards sit in the
 * middle of the screen, so a drone parked squarely behind the car puts the
 * one thing worth watching underneath them. Offsetting the CAMERA walks the
 * car off to the side of frame, where it stays visible beside the card at
 * every viewport. */
const SIDE = 26;

/** Standoff behind the car at a standstill, m, and the metres added per m/s
 * of pace; the altitude it flies at; and the design fov, deg. */
const DIST = 40;
const DIST_PER_SPEED = 0.22;
const HEIGHT = 34;
const FOV = 52;

/** The two slow oscillations that keep the shot alive: a full circle about
 * the car every `TURN` seconds, `SWEEP` rad either side of its heading, and
 * an altitude that breathes `BREATH` m over `RISE` seconds. Both periods are
 * long and mutually prime enough that the pair never visibly repeats while a
 * player reads a menu page. */
const TURN = 46;
const SWEEP = 0.55;
const RISE = 19;
const BREATH = 3;

/** How far ahead of the car the shot is aimed, m, and how high over the
 * ground that point sits. Aimed AHEAD rather than at the car, so the road
 * the bot is about to take is the thing in frame — and high enough to keep
 * some sky in the top of the shot, which is what makes it read as flying
 * rather than as a map scrolling past. */
const AIM_AHEAD = 46;
const AIM_HEIGHT = 12;

/** How briskly the rig answers the car, 1/s: the yaw, then the standoff and
 * the altitude, then the lens. */
const YAW_RATE = 0.9;
const RIG_RATE = 1.2;
const FOV_RATE = 2;

export type DroneCamera = {
  /** Fly one frame. `ground` is the height the shot is built from — the
   * car's own, with the road's cross-section taken out of it, which the
   * caller already reads for the rigs that stand on it. Returns the design
   * fov (horizontal reference) the shot wants. */
  update: (
    camera: THREE.PerspectiveCamera,
    state: GameState,
    ground: number,
    clock: number,
    dt: number,
  ) => number;
};

export function createDroneCamera(): DroneCamera {
  let yaw = 0;
  let dist = DIST;
  let height = HEIGHT;
  let fov = FOV;

  return {
    update: (camera, state, ground, clock, dt) => {
      const car = state.car;
      yaw = angleLerp(yaw, car.heading, clamp(YAW_RATE * dt, 0, 1));
      const look = yaw + Math.sin(clock * ((Math.PI * 2) / TURN)) * SWEEP;
      const wantHeight = HEIGHT + Math.sin(clock * ((Math.PI * 2) / RISE)) * BREATH;
      const rig = clamp(RIG_RATE * dt, 0, 1);
      dist += (DIST + car.u * DIST_PER_SPEED - dist) * rig;
      height += (wantHeight - height) * rig;
      fov += (FOV - fov) * clamp(FOV_RATE * dt, 0, 1);
      const rightX = Math.cos(look);
      const rightZ = -Math.sin(look);
      camera.position.set(
        car.x - Math.sin(look) * dist + rightX * SIDE,
        ground + height,
        car.z - Math.cos(look) * dist + rightZ * SIDE,
      );
      camera.lookAt(
        car.x + Math.sin(look) * AIM_AHEAD + rightX * SIDE * 0.55,
        ground + AIM_HEIGHT,
        car.z + Math.cos(look) * AIM_AHEAD + rightZ * SIDE * 0.55,
      );
      return fov;
    },
  };
}
