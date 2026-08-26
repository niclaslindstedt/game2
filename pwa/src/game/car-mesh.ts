// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car in the scene: a body generated part-by-part from the car's
// CarBodySpec (car-body.ts builds it, car-styles.ts shapes it), plus the
// one visual that sells the jump — a blob shadow that stays on the ground
// and shrinks while the car is airborne. Attitude (the pitch of the road
// and of the flight, plus a wobble in the air) is applied to the body
// group; the physics owns the position and heading.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarSpec, GameState } from "@engine";

import { buildCarBody } from "./car-body.ts";
import { createCarDirt } from "./car-dirt.ts";
import { bodySpecFor } from "./car-styles.ts";

export type CarVisual = {
  group: THREE.Group;
  shadow: THREE.Mesh;
  update: (state: GameState, dt: number) => void;
  dispose: () => void;
};

export function buildCar(spec: CarSpec): CarVisual {
  const group = new THREE.Group();
  const bodySpec = bodySpecFor(spec);
  const body = buildCarBody(bodySpec);
  group.add(body.group);
  const dirt = createCarDirt(body.group);

  const length = bodySpec.profile[0].z - bodySpec.profile[bodySpec.profile.length - 1].z;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(length * 0.42, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;

  let roll = 0;
  let pitch = 0;
  let steerVisual = 0;
  const update = (state: GameState, dt: number): void => {
    const car = state.car;
    group.position.set(car.x, car.y, car.z);
    group.rotation.y = car.heading;

    // Attitude is PITCH, plus a wobble while the car is in the air. A rally
    // car goes sideways FLAT: leaning the body into the slide is what makes
    // a drift read as a skier carving rather than a car turning, so nothing
    // on the ground ever rolls the body — a drift reads through the yaw, the
    // counter-steered wheels and the dust.
    //
    // The pitch is the direction the car is actually travelling in the
    // vertical plane — vy/u. Grounded that is the road's own gradient (the
    // engine gives the car the road's vertical speed), so the nose lifts
    // going up a grade and drops over the far side; airborne it is the
    // ballistic arc. Smoothed, so landings settle with a touch of suspension
    // travel instead of snapping.
    const targetRoll = car.airborne ? Math.sin(state.t * 7) * 0.06 : 0;
    const targetPitch = clamp(Math.atan2(car.vy, Math.max(8, car.u)), -0.5, 0.5);
    const k = clamp(10 * dt, 0, 1);
    roll += (targetRoll - roll) * k;
    pitch += (targetPitch - pitch) * k;
    body.group.rotation.z = roll;
    body.group.rotation.x = pitch;

    // Wheels: spin with road speed, front pair points where the driver
    // points them — counter-steer in a drift shows because the input does.
    const spin = (car.u * dt) / bodySpec.wheelRadius;
    const wantSteer = clamp(car.steer * 0.55, -0.7, 0.7);
    steerVisual += (wantSteer - steerVisual) * clamp(14 * dt, 0, 1);
    for (let i = 0; i < body.wheelSpin.length; i++) {
      body.wheelSpin[i].rotation.x += spin;
      if (i < 2) body.wheelGroups[i].rotation.y = steerVisual;
    }

    dirt.update(state, dt);

    // Blob shadow: pinned to the ground under the car, fading with height.
    const height = Math.max(0, car.y - groundYUnder(state));
    shadow.position.set(car.x, groundYUnder(state) + 0.06, car.z);
    const s = clamp(1 - height * 0.12, 0.35, 1);
    shadow.scale.set(s, s, s);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.28 * s;
  };

  const dispose = (): void => {
    body.dispose();
    shadow.geometry.dispose();
    (shadow.material as THREE.MeshBasicMaterial).dispose();
  };

  return { group, shadow, update, dispose };
}

/** Road height under the car (the sample the physics last locked to). */
function groundYUnder(state: GameState): number {
  return state.track.samples[state.progressIndex]?.elevation ?? 0;
}
