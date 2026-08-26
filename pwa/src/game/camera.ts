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
  const camera = new THREE.PerspectiveCamera(64, width / height, 0.25, 900);
  let mode: CameraMode = "chase";
  let yaw = 0;
  let dist = 7.2;
  let height_ = 2.5;
  let shake = 0;
  let fov = 64;

  const updateChase = (state: GameState, dt: number): void => {
    const car = state.car;
    const speed = Math.hypot(car.u, car.w);
    const velAngle =
      speed > 3 ? car.heading + Math.atan2(car.w, Math.max(0.001, car.u)) : car.heading;
    // Grounded: 40% nose, 60% travel — the drift angle shows. Airborne:
    // follow the travel direction fully; the nose is doing its own thing.
    const target = car.airborne ? velAngle : angleLerp(car.heading, velAngle, 0.6);
    yaw = angleLerp(yaw, target, clamp((car.airborne ? 2.2 : 5) * dt, 0, 1));

    // Low and close — the classic arcade chase. The air pulls up and back.
    const wantDist = car.airborne ? 10 : 7.2 + car.u * 0.018;
    const wantHeight = car.airborne ? 4.2 + car.vy * 0.14 : 2.5;
    dist += (wantDist - dist) * clamp(3 * dt, 0, 1);
    height_ += (wantHeight - height_) * clamp(3 * dt, 0, 1);

    const wantFov = 60 + car.u * 0.34 + (car.airborne ? 6 : 0);
    fov += (wantFov - fov) * clamp(4 * dt, 0, 1);

    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    camera.position.set(
      car.x - Math.sin(yaw) * dist + sx,
      car.y + height_ + sy,
      car.z - Math.cos(yaw) * dist,
    );
    camera.lookAt(car.x + Math.sin(yaw) * 6, car.y + 1.05 + sy * 0.5, car.z + Math.cos(yaw) * 6);
  };

  const updateHood = (state: GameState, dt: number): void => {
    const car = state.car;
    // The hood cam sits on the car and looks where the NOSE points — in a
    // drift the world sweeps across the windshield, which is the drama.
    yaw = angleLerp(yaw, car.heading, clamp(14 * dt, 0, 1));
    const wantFov = 66 + car.u * 0.3 + (car.airborne ? 8 : 0);
    fov += (wantFov - fov) * clamp(5 * dt, 0, 1);
    const sx = (Math.random() - 0.5) * shake * 0.6;
    const sy = (Math.random() - 0.5) * shake * 0.6;
    camera.position.set(
      car.x + Math.sin(yaw) * 0.4 + sx,
      car.y + 1.15 + sy,
      car.z + Math.cos(yaw) * 0.4,
    );
    camera.lookAt(car.x + Math.sin(yaw) * 12, car.y + 0.9 + sy, car.z + Math.cos(yaw) * 12);
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
