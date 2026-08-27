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

import { buildCarBody, frontLampAnchors, rearLampAnchors } from "./car-body.ts";
import { createCarDamage } from "./car-damage.ts";
import { createCarDirt, wheelSpray } from "./car-dirt.ts";
import { bodySpecFor } from "./car-styles.ts";
import { glowTexture } from "./textures.ts";

/** The tail lamps' own light: a red bloom laid over each lens so the lamp
 * reads as SWITCHED ON rather than as a red panel. The car is fullbright and
 * takes the time of day as a tint (renderer.ts), which is right for paint and
 * wrong for a lamp — a lamp is the one thing on the body that gets brighter
 * as the light goes, not darker. Additive, so it survives the tint underneath
 * it. */
const LAMP_GLOW = 0xff2a14;
/** How far the bloom spreads past the lens, as a multiple of the lens size. */
const LAMP_SPREAD = 3.4;
/** Bloom strength with the lights off (daylight) and on (dusk, night). */
const LAMP_DAY = 0.22;
const LAMP_NIGHT = 0.85;
/** How much of the bloom a fully caked lens swallows, 0..1. A stage's worth
 * of gravel on the glass is the reason rally cars carry lamp pods and
 * somebody wipes them at every service. */
const LAMP_GRIME = 0.6;

/** Where a car with no authored lamps at one end throws its beam from, m
 * from the centerline — a spec is allowed to have a bare face, and a beam
 * still has to come from somewhere sensible. */
const LAMP_FALLBACK = 0.6;

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
  /** Whether the run's light is gone — the tail lamps burn harder when it
   * is. Pushed from the environment, which owns that decision. */
  setLights: (on: boolean) => void;
  /** How filthy the car has got, 0..1 — the environment dims its beams by
   * it, because the dirt is on the glass too. */
  grime: () => number;
  /** How far off the centerline this car's lamps sit, m. The environment
   * hangs a beam on each one, so a wide car lights a wide road. */
  lampSpread: { front: number; rear: number };
  dispose: () => void;
};

/** How far off the centerline this car's beams hang, front and rear. */
function lampSpread(bodySpec: Parameters<typeof frontLampAnchors>[0]): {
  front: number;
  rear: number;
} {
  const off = (anchors: { x: number }[]): number =>
    anchors.length > 0 ? Math.abs(anchors[0].x) : LAMP_FALLBACK;
  return { front: off(frontLampAnchors(bodySpec)), rear: off(rearLampAnchors(bodySpec)) };
}

export function buildCar(spec: CarSpec): CarVisual {
  const group = new THREE.Group();
  const bodySpec = bodySpecFor(spec);
  const body = buildCarBody(bodySpec);
  group.add(body.group);
  const dirt = createCarDirt(body.group, wheelSpray(bodySpec));
  const damage = createCarDamage(body);

  // The lamp blooms ride the SPRUNG body, so they squat and rebound with the
  // panel they are stuck to instead of hovering where the tail used to be.
  const lampMap = glowTexture();
  const lampMat = new THREE.MeshBasicMaterial({
    map: lampMap,
    color: LAMP_GLOW,
    transparent: true,
    opacity: LAMP_DAY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lampGeos: THREE.BufferGeometry[] = [];
  for (const lamp of rearLampAnchors(bodySpec)) {
    const geo = new THREE.PlaneGeometry(lamp.width * LAMP_SPREAD, lamp.height * LAMP_SPREAD * 1.5);
    const glow = new THREE.Mesh(geo, lampMat);
    // The tail cap faces −z in car space; the bloom sits just off the lens.
    glow.position.set(lamp.x, lamp.y, lamp.z - 0.05);
    glow.rotation.y = Math.PI;
    body.chassis.add(glow);
    lampGeos.push(geo);
  }
  let lit = false;
  const setLights = (on: boolean): void => {
    lit = on;
  };
  /** The bloom, dimmed by whatever the run has thrown at the lens. */
  const shineLamps = (): void => {
    lampMat.opacity = (lit ? LAMP_NIGHT : LAMP_DAY) * (1 - LAMP_GRIME * dirt.level());
  };

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
    shineLamps();
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
    for (const geo of lampGeos) geo.dispose();
    lampMat.dispose();
    lampMap.dispose();
  };

  return {
    group,
    shadow,
    debris: damage.debris,
    update,
    onEvents: damage.onEvents,
    setLights,
    grime: dirt.level,
    lampSpread: lampSpread(bodySpec),
    dispose,
  };
}

/** Ground height under the car. Out in the wild the road sample the car is
 * measured against can be a hillside away, so the terrain answers directly
 * there — a shadow at the road's elevation floats over the valley below. */
function groundYUnder(state: GameState): number {
  if (state.offRoad) return state.terrain.groundAt(state.car.x, state.car.z);
  return state.track.samples[state.progressIndex]?.elevation ?? 0;
}
