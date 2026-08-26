// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car: a handful of boxes and cylinders in the car's livery, plus the
// one visual that sells the jump — a blob shadow that stays on the ground
// and shrinks while the car is airborne. Attitude (drift roll, air pitch)
// is applied to the body group; the physics owns the position and heading.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarSpec, GameState } from "@engine";

export type CarVisual = {
  group: THREE.Group;
  shadow: THREE.Mesh;
  update: (state: GameState, dt: number) => void;
  dispose: () => void;
};

export function buildCar(spec: CarSpec): CarVisual {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = new THREE.MeshBasicMaterial({ color: spec.color });
  const accent = new THREE.MeshBasicMaterial({ color: spec.accent });
  const dark = new THREE.MeshBasicMaterial({ color: "#14181f" });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.5, 3.6), paint);
  hull.position.y = 0.45;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.45, 1.5), dark);
  cabin.position.set(0, 0.85, -0.2);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.6), accent);
  roof.position.set(0, 1.1, -0.2);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.45), accent);
  wing.position.set(0, 0.95, -1.75);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 3.62), accent);
  stripe.position.y = 0.45;
  body.add(hull, cabin, roof, wing, stripe);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.85, 1.15],
    [0.85, 1.15],
    [-0.85, -1.15],
    [0.85, -1.15],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(x, 0.34, z);
    body.add(wheel);
    wheels.push(wheel);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;

  let roll = 0;
  let pitch = 0;
  const update = (state: GameState, dt: number): void => {
    const car = state.car;
    group.position.set(car.x, car.y, car.z);
    group.rotation.y = car.heading;

    // Drift lean and airborne attitude, smoothed so landings snap back with
    // a touch of suspension travel instead of teleporting.
    const targetRoll = car.airborne
      ? Math.sin(state.t * 7) * 0.06
      : clamp(car.slip * 0.5, -0.5, 0.5);
    const targetPitch = car.airborne
      ? clamp(-car.vy * 0.045, -0.4, 0.5)
      : clamp(-car.u * 0.002, -0.1, 0);
    const k = clamp(10 * dt, 0, 1);
    roll += (targetRoll - roll) * k;
    pitch += (targetPitch - pitch) * k;
    body.rotation.z = roll;
    body.rotation.x = pitch;

    // Wheels: spin with speed, front pair follows the slip for the
    // counter-steer look.
    const spin = (car.u * dt) / 0.34;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += spin;
      if (i < 2) wheels[i].rotation.y = clamp(-car.slip * 1.4, -0.6, 0.6);
    }

    // Blob shadow: pinned to the ground under the car, fading with height.
    const height = Math.max(0, car.y - groundYUnder(state));
    shadow.position.set(car.x, groundYUnder(state) + 0.06, car.z);
    const s = clamp(1 - height * 0.12, 0.35, 1);
    shadow.scale.set(s, s, s);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.28 * s;
  };

  const dispose = (): void => {
    for (const g of [hull, cabin, roof, wing, stripe, ...wheels, shadow]) g.geometry.dispose();
    paint.dispose();
    accent.dispose();
    dark.dispose();
    (shadow.material as THREE.MeshBasicMaterial).dispose();
  };

  return { group, shadow, update, dispose };
}

/** Road height under the car (the sample the physics last locked to). */
function groundYUnder(state: GameState): number {
  return state.track.samples[state.progressIndex]?.elevation ?? 0;
}
