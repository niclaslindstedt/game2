// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car in the scene: a body generated part-by-part from the car's
// CarBodySpec (car-body.ts builds it, car-styles.ts shapes it), plus the
// one visual that sells the jump — a blob shadow that stays on the ground
// and shrinks while the car is airborne. Attitude (the pitch of the road
// and of the flight, plus the roll a take-off put in the body) is applied
// to the body group; the physics owns the position and heading.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarSpec, GameEvent, GameState } from "@engine";

import { buildCarBody } from "./car-body.ts";
import { createCarDamage } from "./car-damage.ts";
import { createCarDirt } from "./car-dirt.ts";
import { bodySpecFor } from "./car-styles.ts";

/** Front-wheel visual steer: radians of wheel angle at full lock... */
const WHEEL_STEER_LOCK = 0.55;
/** ...hard-clamped here, rad — past this the wheels read as broken. */
const WHEEL_STEER_MAX = 0.7;
/** How fast the drawn wheels chase the input, 1/s — quick enough to read
 * as the driver's hands, slow enough not to strobe at 120 Hz input. */
const WHEEL_STEER_RATE = 14;

export type CarVisual = {
  group: THREE.Group;
  shadow: THREE.Mesh;
  /** World-anchored debris (torn-off parts) — scene sibling of the car. */
  debris: THREE.Group;
  update: (state: GameState, dt: number) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  dispose: () => void;
};

export function buildCar(spec: CarSpec): CarVisual {
  const group = new THREE.Group();
  const bodySpec = bodySpecFor(spec);
  const body = buildCarBody(bodySpec);
  group.add(body.group);
  const dirt = createCarDirt(body.group);
  const damage = createCarDamage(body);

  const length = bodySpec.profile[0].z - bodySpec.profile[bodySpec.profile.length - 1].z;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(length * 0.42, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;

  let pitch = 0;
  let steerVisual = 0;
  const update = (state: GameState, dt: number): void => {
    const car = state.car;
    group.position.set(car.x, car.y, car.z);
    group.rotation.y = car.heading;

    // Attitude is PITCH, plus whatever ROLL the physics has put in the body
    // — which only a take-off ever does. A rally car goes sideways FLAT:
    // leaning into the slide is what makes a drift read as a skier carving
    // rather than a car turning, so nothing on the ground rolls the body —
    // a drift reads through the yaw, the counter-steered wheels and the
    // dust. In the air the roll is the engine's, tumble and all.
    //
    // The pitch is the direction the car is actually travelling in the
    // vertical plane — vy/u. Grounded that is the road's own gradient (the
    // engine gives the car the road's vertical speed), so the nose lifts
    // going up a grade and drops over the far side; airborne it is the
    // ballistic arc. Smoothed, so landings settle with a touch of suspension
    // travel instead of snapping.
    const targetPitch = clamp(Math.atan2(car.vy, Math.max(8, car.u)), -0.5, 0.5);
    pitch += (targetPitch - pitch) * clamp(10 * dt, 0, 1);
    body.group.rotation.z = car.roll;
    body.group.rotation.x = pitch;

    // Wheels: spin with road speed, front pair points where the driver
    // points them — counter-steer in a drift shows because the input does.
    const spin = (car.u * dt) / bodySpec.wheelRadius;
    const wantSteer = clamp(car.steer * WHEEL_STEER_LOCK, -WHEEL_STEER_MAX, WHEEL_STEER_MAX);
    steerVisual += (wantSteer - steerVisual) * clamp(WHEEL_STEER_RATE * dt, 0, 1);
    for (let i = 0; i < body.wheelSpin.length; i++) {
      body.wheelSpin[i].rotation.x += spin;
      if (i < 2) body.wheelGroups[i].rotation.y = steerVisual;
    }

    dirt.update(state, dt);
    damage.update(state, dt);

    // Blob shadow: pinned to the ground under the car, fading with height.
    const height = Math.max(0, car.y - groundYUnder(state));
    shadow.position.set(car.x, groundYUnder(state) + 0.06, car.z);
    const s = clamp(1 - height * 0.12, 0.35, 1);
    shadow.scale.set(s, s, s);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.28 * s;
  };

  const dispose = (): void => {
    damage.dispose();
    body.dispose();
    shadow.geometry.dispose();
    (shadow.material as THREE.MeshBasicMaterial).dispose();
  };

  return { group, shadow, debris: damage.debris, update, onEvents: damage.onEvents, dispose };
}

/** Road height under the car (the sample the physics last locked to). */
function groundYUnder(state: GameState): number {
  return state.track.samples[state.progressIndex]?.elevation ?? 0;
}
