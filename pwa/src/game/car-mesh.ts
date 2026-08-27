// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car in the scene: a body generated part-by-part from the car's
// CarBodySpec (car-body.ts builds it, car-styles.ts shapes it), plus the
// one visual that sells the jump — a blob shadow that stays on the ground
// and shrinks while the car is airborne. The engine owns everything about
// how the car sits: position, heading, and both attitude angles; this file
// only spends them on the right three.js axes.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarSpec, GameEvent, GameState } from "@engine";

import { buildCarBody } from "./car-body.ts";
import { createCarDamage } from "./car-damage.ts";
import { createCarDirt, wheelSpray } from "./car-dirt.ts";
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
  /** The blob shadow, in its own group so it can lie on the ground's slope
   * while the car above it pitches, rolls and flies. */
  shadow: THREE.Group;
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
  const dirt = createCarDirt(body.group, wheelSpray(bodySpec));
  const damage = createCarDamage(body);

  const length = bodySpec.profile[0].z - bodySpec.profile[bodySpec.profile.length - 1].z;
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(length * 0.42, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 }),
  );
  // Laid flat, then lifted along whatever "up" its parents end up meaning —
  // the clearance has to leave the GROUND, not the world's y axis, or the
  // disc knifes into a hillside and reads as a hole under the car.
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.06;
  // Same two-group nesting as the car itself, so the disc takes the same
  // heading-then-attitude chain and lands flush on the same triangle.
  const shadowTilt = new THREE.Group();
  shadowTilt.add(blob);
  const shadow = new THREE.Group();
  shadow.add(shadowTilt);

  let steerVisual = 0;
  // The ground's own attitude, held over a flight: in the air the car's
  // angles are the arc's and the tumble's, and the shadow belongs to the
  // ground the car left, not to the car.
  let groundPitch = 0;
  let groundRoll = 0;
  const update = (state: GameState, dt: number): void => {
    const car = state.car;
    group.position.set(car.x, car.y, car.z);
    group.rotation.y = car.heading;

    // Both attitude angles come off the engine already settled. In the car's
    // local frame +z is the nose and +x its right side, so a positive roll
    // (right side up) IS +z rotation, while a nose-up pitch is a NEGATIVE
    // rotation about +x — turning the nose down is the positive direction
    // there. A rally car still goes sideways FLAT: the roll is the camber
    // of the ground and the tumble of a flight, never a lean into the
    // slide, which reads through the yaw, the counter-steer and the dust.
    body.group.rotation.z = car.roll;
    body.group.rotation.x = -car.pitch;

    // The springs, on the SPRUNG mass only: the body squats into a landing,
    // rebounds out of it and dives under the brakes while the wheels stay
    // exactly where the ground put them. This is the whole visible half of
    // the car having weight — the engine decides how far, this just draws
    // it (positive pitchLoad lifts the nose, so it rotates like `pitch`).
    body.chassis.position.y = car.ride;
    body.chassis.rotation.x = -car.pitchLoad;

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

    // Blob shadow: pinned to the ground under the car, lying on its slope,
    // fading with height.
    if (!car.airborne) {
      groundPitch = car.pitch;
      groundRoll = car.roll;
    }
    const ground = groundYUnder(state);
    const height = Math.max(0, car.y - ground);
    shadow.position.set(car.x, ground, car.z);
    shadow.rotation.y = car.heading;
    shadowTilt.rotation.z = groundRoll;
    shadowTilt.rotation.x = -groundPitch;
    const s = clamp(1 - height * 0.12, 0.35, 1);
    shadow.scale.set(s, s, s);
    (blob.material as THREE.MeshBasicMaterial).opacity = 0.28 * s;
  };

  const dispose = (): void => {
    damage.dispose();
    body.dispose();
    blob.geometry.dispose();
    (blob.material as THREE.MeshBasicMaterial).dispose();
  };

  return { group, shadow, debris: damage.debris, update, onEvents: damage.onEvents, dispose };
}

/** Ground height under the car. Out in the wild the road sample the car is
 * measured against can be a hillside away, so the terrain answers directly
 * there — a shadow at the road's elevation floats over the valley below. */
function groundYUnder(state: GameState): number {
  if (state.offRoad) return state.terrain.groundAt(state.car.x, state.car.z);
  return state.track.samples[state.progressIndex]?.elevation ?? 0;
}
