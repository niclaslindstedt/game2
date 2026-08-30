// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLYING FINISH — the beat a stage closes on, and the counterpart to
// camera-start.ts at the other end of the road.
//
// The moment the car crosses the line the camera stops travelling with it,
// plants itself where it stood, and simply turns to watch the car go. It is
// the shot every rally broadcast cuts to, and it is the reason R25 builds
// road past the gate for the car to disappear down.
//
// Three things make it read as an operator rather than as a rig:
//
//   IT PLANTS WHERE THE PLAYER ALREADY WAS. The stand is taken from wherever
//   the camera happened to be on the last racing frame — whichever rig was
//   up, the hood cam included — so the shot begins from the view they were
//   driving in rather than cutting to a position they have never seen.
//
//   IT RISES A LITTLE AND GOES LONG. A broadcast camera is on a rostrum, not
//   on the road, and the lens pulls in over the same beat: the car recedes
//   into a flatter, tighter frame instead of racing away down a wide-angle
//   tunnel. Both ease in over `settle` rather than cutting, because a cut
//   would land in the middle of the one moment the player is watching.
//
//   IT PANS LATE. The aim follows the car loosely, and a pan that tracked
//   perfectly would read as a lock rather than as somebody turning a head.
//
// The plant is DROPPED, not eased, when the lens has been somewhere else
// entirely — the spectator feed flies it off to another crew's road
// (spectate.ts), and a shot planted there would watch the car from a
// kilometre away. `camera.ts`'s `retake` is what drops it.

import * as THREE from "three";
import { clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

const FINISH = {
  /** Seconds the plant takes to complete. */
  settle: 1.1,
  /** How far the camera rises onto its rostrum, m. Deliberately modest: the
   * gate's banner hangs at 4.7 m, and a camera that climbs to meet it turns
   * the arch into a wall ruled across the middle of the frame. Staying
   * under it leaves the gate where it belongs — an arch over the top third,
   * with the road and the departing car running away beneath it. */
  lift: 1,
  /** ...and how far back off the line it drifts while it does, m. A nudge,
   * not a retreat: the whole point of the shot is that the camera STAYS. */
  back: 1.5,
  /** The long lens it settles to, degrees. */
  fov: 46,
  /** How fast the aim follows the car, 1/s. Loose: a planted camera pans,
   * and a pan that tracks perfectly reads as a lock rather than an
   * operator. */
  pan: 3.4,
  /** How far above the car's own height the aim sits, m. */
  aimUp: 0.7,
};

export type FinishCamera = {
  /** Fly the shot for this frame. `clearance` is how far the camera may
   * never sink below the ground under it — the chase rigs' own number,
   * passed in because the floor belongs to the rig and not to the shot.
   * Returns the design fov for this frame, given the one it came in on. */
  fly: (
    camera: THREE.PerspectiveCamera,
    state: GameState,
    fov: number,
    clearance: number,
    dt: number,
  ) => number;
  /** Drop the plant, so the next frame stands the shot wherever the camera
   * is then. Called whenever the run stops being one that has finished, and
   * whenever the lens has been somewhere the shot must not inherit. */
  reset: () => void;
};

export function createFinishCamera(): FinishCamera {
  /** Where the camera was standing when the car crossed the line, and which
   * way "back off the line" is from there. Null until it plants. */
  let planted: { x: number; y: number; z: number; back: THREE.Vector3 } | null = null;
  const aim = new THREE.Vector3();

  return {
    reset: () => {
      planted = null;
    },
    fly: (camera, state, fov, clearance, dt) => {
      const car = state.car;
      if (!planted) {
        // Behind the camera along its own view axis: which way "back off the
        // line" is, without assuming the camera was ever facing down the road.
        const back = new THREE.Vector3();
        camera.getWorldDirection(back);
        back.y = 0;
        if (back.lengthSq() < 1e-6) back.set(0, 0, 1);
        back.normalize().negate();
        planted = { x: camera.position.x, y: camera.position.y, z: camera.position.z, back };
        aim.set(car.x, car.y + FINISH.aimUp, car.z);
      }
      // A smoothstep on the roll-out's own clock, so the plant is a fixed
      // gesture and not something a slow frame can outrun.
      const t = Math.min(1, state.rollout / FINISH.settle);
      const ease = t * t * (3 - 2 * t);
      const px = planted.x + planted.back.x * FINISH.back * ease;
      const pz = planted.z + planted.back.z * FINISH.back * ease;
      const ground = state.terrain.groundAt(px, pz);
      camera.position.set(px, Math.max(planted.y + FINISH.lift * ease, ground + clearance), pz);
      // The pan lags the car, which is what makes it read as an operator
      // following it rather than a rig bolted to it.
      const follow = clamp(FINISH.pan * dt, 0, 1);
      aim.x += (car.x - aim.x) * follow;
      aim.y += (car.y + FINISH.aimUp - aim.y) * follow;
      aim.z += (car.z - aim.z) * follow;
      camera.lookAt(aim);
      return fov + (FINISH.fov - fov) * clamp(2.4 * dt, 0, 1);
    },
  };
}
