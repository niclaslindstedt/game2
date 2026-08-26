// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The camera — where a lot of the FEEL lives. Cameras are MODES so more can
// be added later (roadside replay, drone, …); two ship now:
//
//   chase — the classic arcade rally view: low, tight behind the car,
//           tracking a blend of nose and travel direction so a drift swings
//           the car across the frame while the road keeps flowing.
//   hood  — in-car/bumper: the road rushes, the nose barely leads the slide.
//
// In the air both modes go loose and pull wide, which reads as flying.
// Landings and splashes kick a decaying shake.

import * as THREE from "three";
import { angleLerp, clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

export type CameraMode = "chase" | "hood";
export const CAMERA_MODES: CameraMode[] = ["chase", "hood"];

export type GameCamera = {
  camera: THREE.PerspectiveCamera;
  mode: () => CameraMode;
  setMode: (mode: CameraMode) => void;
  cycle: () => CameraMode;
  update: (state: GameState, dt: number) => void;
  kick: (strength: number) => void;
  resize: (width: number, height: number) => void;
};

export function createGameCamera(width: number, height: number): GameCamera {
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.25, 900);
  let mode: CameraMode = "chase";
  let yaw = 0;
  let dist = 6.2;
  let height_ = 2.0;
  let shake = 0;
  let fov = 60;
  /** Lateral camera offset toward the outside of the current turn, m. */
  let swing = 0;

  const updateChase = (state: GameState, dt: number): void => {
    const car = state.car;
    const speed = Math.hypot(car.u, car.w);
    const velAngle =
      speed > 3 ? car.heading + Math.atan2(car.w, Math.max(0.001, car.u)) : car.heading;
    // Grounded: 20% nose, 80% travel — the Sega Rally read: the camera
    // follows the ROAD, so a drift swings the car across the frame while
    // the road keeps flowing to the vanishing point. Airborne: follow the
    // travel direction fully; the nose is doing its own thing.
    const target = car.airborne ? velAngle : angleLerp(car.heading, velAngle, 0.8);
    yaw = angleLerp(yaw, target, clamp((car.airborne ? 2.2 : 4.5) * dt, 0, 1));

    // Proportions read off the Sega Rally chase cam: roof-height camera
    // (~2 m) pitched only a few degrees down, close behind, so the car
    // anchors the BOTTOM of the frame and the horizon rides high. The frame
    // does NOT change when the car leaves the ground: pulling back for a
    // jump makes the biggest moment in the stage read as small and safe,
    // and it is the one moment the camera should hold its nerve.
    const wantDist = 5.6 + car.u * 0.02;
    const wantHeight = 2.0;
    dist += (wantDist - dist) * clamp(3 * dt, 0, 1);
    height_ += (wantHeight - height_) * clamp(3 * dt, 0, 1);

    // Speed lives in the FOV: it stretches hard with pace (capped before
    // the boost overrun turns the world into a tunnel).
    const wantFov = Math.min(86, 58 + car.u * 0.38);
    fov += (wantFov - fov) * clamp(4 * dt, 0, 1);

    // Turning swings the camera toward the OUTSIDE of the corner, so a
    // turn reads in the framing even before the drift angle does.
    const wantSwing = clamp(-car.yawRate * 0.45, -1.3, 1.3);
    swing += (wantSwing - swing) * clamp(4 * dt, 0, 1);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    camera.position.set(
      car.x - Math.sin(yaw) * dist + rightX * swing + sx,
      car.y + height_ + sy,
      car.z - Math.cos(yaw) * dist + rightZ * swing,
    );
    // Aim well down the road and low over the roof: the drop from camera
    // to aim point over ~14 m of run is the ~5° downward pitch of the
    // reference frame — car at the bottom, horizon high. On a slope the aim
    // rides the climb (vy/u is the road's gradient while grounded), so a
    // ramp shows the sky over the brow instead of the camera burying its
    // aim in the hillside.
    const climb = clamp(car.vy / Math.max(10, car.u), -0.4, 0.4);
    camera.lookAt(
      car.x + Math.sin(yaw) * 8,
      car.y + 0.8 + climb * 6 + sy * 0.5,
      car.z + Math.cos(yaw) * 8,
    );
  };

  const updateHood = (state: GameState, dt: number): void => {
    const car = state.car;
    // The hood cam sits on the car and looks where the NOSE points — in a
    // drift the world sweeps across the windshield, which is the drama.
    yaw = angleLerp(yaw, car.heading, clamp(14 * dt, 0, 1));
    const wantFov = Math.min(92, 64 + car.u * 0.42);
    fov += (wantFov - fov) * clamp(5 * dt, 0, 1);
    const sx = (Math.random() - 0.5) * shake * 0.6;
    const sy = (Math.random() - 0.5) * shake * 0.6;
    const climb = clamp(car.vy / Math.max(10, car.u), -0.4, 0.4);
    camera.position.set(
      car.x + Math.sin(yaw) * 0.4 + sx,
      car.y + 1.15 + sy,
      car.z + Math.cos(yaw) * 0.4,
    );
    camera.lookAt(
      car.x + Math.sin(yaw) * 12,
      car.y + 0.9 + climb * 9 + sy,
      car.z + Math.cos(yaw) * 12,
    );
  };

  const update = (state: GameState, dt: number): void => {
    shake = Math.max(0, shake - 6 * dt * shake - 0.4 * dt);
    if (mode === "hood") updateHood(state, dt);
    else updateChase(state, dt);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };

  return {
    camera,
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    cycle: () => {
      mode = CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length];
      return mode;
    },
    update,
    kick: (strength) => {
      shake = Math.min(0.8, shake + strength);
    },
    resize: (width2, height2) => {
      camera.aspect = width2 / height2;
      camera.updateProjectionMatrix();
    },
  };
}
