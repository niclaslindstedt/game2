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

import {
  backlightNormal,
  buildCarBody,
  frontLampAnchors,
  rearLampAnchors,
  steeringTurn,
  GLASS_OPACITY,
  type InteriorDetail,
} from "./car-body.ts";
import { createCarDamage } from "./car-damage.ts";
import { createCarDirt, wheelSpray } from "./car-dirt.ts";
import type { Livery } from "./car-livery.ts";
import { bodySpecFor } from "./car-styles.ts";
import { drivenAxles, wheelSurfaceSpeed } from "./car-wheels.ts";
import { glowTexture } from "./textures.ts";

/** The tail lamps' own light: a red bloom laid over each lens so the lamp
 * reads as SWITCHED ON rather than as a red panel. The car is fullbright and
 * takes the time of day as a tint (renderer.ts), which is right for paint and
 * wrong for a lamp — a lamp is the one thing on the body that gets brighter
 * as the light goes, not darker. Additive over the lens, and exempt from the
 * tint by name, so the failing light cannot bleach the red out of it. */
const LAMP_GLOW = 0xff2a14;
/** The name that exempts it — matched in the renderer's `applyTint`. */
export const LAMP_MATERIAL = "car-lamp";
/** How far the bloom spreads past the lens, as a multiple of the lens size. */
const LAMP_SPREAD = 3.4;
/** Bloom strength with the lights off (daylight) and on (dusk, night). A
 * tail lamp is a marker, not a headlight pointed at the player: at the few
 * car lengths a chase is fought over, a bloom that reads as a lamp from a
 * hundred metres is a red smear over the whole tail up close. */
const LAMP_DAY = 0.11;
const LAMP_NIGHT = 0.42;
/** How much of the bloom a fully caked lens swallows, 0..1. A stage's worth
 * of gravel on the glass is the reason rally cars carry lamp pods and
 * somebody wipes them at every service. */
const LAMP_GRIME = 0.6;

/** The glass, per frame. `GLINT` is how much opacity a fully glancing view
 * adds to a clean pane — the baked sky at the top of every window is already
 * there, and raising the pane's opacity is what brings it forward over the
 * cabin behind it, so a car thrown sideways flares along its whole
 * greenhouse. `GRIME` is the same number for filth: a screen nobody has
 * wiped stops being something you can see a crew through. `CEILING` keeps
 * both short of solid, because a window that closes completely is a panel. */
const GLASS = { glint: 0.26, grime: 0.24, ceiling: 0.94, falloff: 3 };

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
  /** The cabin and the glass over it. Handed out for one reason: the
   * rear-view mirror's lens sits between this car's own seats, so the mirror
   * pass has to take both out first or it draws the back of the bulkhead
   * through the inside of the rear screen instead of the road
   * (renderer.ts). */
  cabin: THREE.Object3D;
  /** The blob shadow, in its own group so it can lie on the ground's slope
   * while the car above it pitches, rolls and flies. */
  shadow: THREE.Group;
  /** World-anchored debris (torn-off parts) — scene sibling of the car. */
  debris: THREE.Group;
  /** `eye` is where the camera is standing, in world metres — what decides
   * how hard the glass catches the light this frame. Left off, the pane
   * keeps whatever it had. */
  update: (state: GameState, dt: number, eye?: THREE.Vector3) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  /** Whether the run's light is gone — the tail lamps burn harder when it
   * is. Pushed from the environment, which owns that decision. */
  setLights: (on: boolean) => void;
  /** How hard it is raining on this car, 0..1 — what wets its screens and
   * sets its wipers going. Pushed from the environment for the same reason
   * the light is: the weather is the stage's, not the car's. */
  setWet: (rain: number) => void;
  /** How filthy the car has got, 0..1 — the environment dims its beams by
   * it, because the dirt is on the glass too. */
  grime: () => number;
  /** How far off the centerline this car's lamps sit, m. The environment
   * hangs a beam on each one, so a wide car lights a wide road. */
  lampSpread: { front: number; rear: number };
  dispose: () => void;
};

/** How much of itself a ghost car shows, 0..1. Solid enough to hold its
 * shape and its tail lamps at the few car lengths a chase is actually
 * decided over, thin enough that the road runs visibly through it and it can
 * never be taken for a car that is there — a ghost is a picture: it runs its
 * own game, so there is nothing to touch and nothing to be hit by. */
const GHOST_OPACITY = 0.46;

export type CarOptions = {
  /** Build the car as a ghost: see-through, and dimmer where it glows. */
  ghost?: boolean;
  /** How much cabin is built behind the glass — the player's VIDEO option.
   * Defaults to the full one; the field builds itself down a level, because
   * fifteen cabins is a different bill from one. */
  interior?: InteriorDetail;
  /** Repaint the body in one of the field's schemes (car-livery.ts) rather
   * than the livery car-styles.ts authored for it — how a car that is not
   * the player's is told apart from the player's. */
  paint?: Livery;
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

/** Push the environment onto one body: its light, and how hard it is
 * raining on it. Everything on a car carries BAKED vertex colours on
 * fullbright materials, so the time of day arrives as a multiply into
 * `material.color` rather than as a light — except a LAMP, which is the one
 * thing the failing light makes brighter, and is therefore switched rather
 * than tinted. */
export function tintCar(
  visual: CarVisual,
  tint: THREE.Color,
  lampsLit: boolean,
  rain: number,
): void {
  visual.group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Points)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      const painted = mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.PointsMaterial;
      if (painted && mat.name !== LAMP_MATERIAL) mat.color.copy(tint);
    }
  });
  visual.setLights(lampsLit);
  visual.setWet(rain);
}

export function buildCar(spec: CarSpec, options: CarOptions = {}): CarVisual {
  const group = new THREE.Group();
  // Which wheels the engine can spin, and which ones only the road turns.
  const driven = drivenAxles(spec.drive);
  const bodySpec = bodySpecFor(spec, options.paint);
  const body = buildCarBody(bodySpec, { interior: options.interior });
  // Panels, parts and wheels share one material, so a ghost is one flag.
  // Its own back faces still occlude its front ones (depth writing stays
  // on): a car you can see through is a ghost, a car you can see the
  // INSIDE of is a bag of polygons.
  const fade = options.ghost ? GHOST_OPACITY : 1;
  if (options.ghost) {
    const shell = body.body.material as THREE.MeshBasicMaterial;
    shell.transparent = true;
    shell.opacity = GHOST_OPACITY;
  }
  // The glass is already translucent, so a ghost's glass is a fade ON a
  // fade: whatever the pane works out to this frame, times the ghost's own.
  const glassMat = body.glass;
  const screen = backlightNormal(bodySpec);
  const view = new THREE.Vector3();
  group.add(body.group);
  const dirt = createCarDirt(body.group, wheelSpray(bodySpec));
  const damage = createCarDamage(body);

  // The lamp blooms ride the SPRUNG body, so they squat and rebound with the
  // panel they are stuck to instead of hovering where the tail used to be.
  const lampMap = glowTexture();
  const lampMat = new THREE.MeshBasicMaterial({
    name: LAMP_MATERIAL,
    map: lampMap,
    color: LAMP_GLOW,
    transparent: true,
    opacity: LAMP_DAY * fade,
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
  let wet = 0;
  const setWet = (rain: number): void => {
    wet = clamp(rain, 0, 1);
  };
  /** The bloom, dimmed by whatever the run has thrown at the lens. */
  const shineLamps = (): void => {
    lampMat.opacity = (lit ? LAMP_NIGHT : LAMP_DAY) * (1 - LAMP_GRIME * dirt.level()) * fade;
  };

  const length = bodySpec.profile[0].z - bodySpec.profile[bodySpec.profile.length - 1].z;
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(length * 0.42, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 * fade }),
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
  /** How much of itself the glass is showing this frame: its own baked
   * gradient, brought forward by the angle the eye is standing at and by
   * whatever the stage has caked on it. The angle is taken in the CAR's own
   * frame — the pane turns with the car, and a drift is exactly the moment
   * the two disagree. */
  const shineGlass = (state: GameState, eye?: THREE.Vector3): void => {
    if (!glassMat) return;
    let glint = 0;
    if (eye) {
      const dx = eye.x - state.car.x;
      const dz = eye.z - state.car.z;
      const h = -state.car.heading;
      view
        .set(
          dx * Math.cos(h) + dz * Math.sin(h),
          eye.y - state.car.y,
          -dx * Math.sin(h) + dz * Math.cos(h),
        )
        .normalize();
      glint = Math.pow(1 - Math.abs(view.dot(screen)), GLASS.falloff);
    }
    const want = GLASS_OPACITY + GLASS.glint * glint + GLASS.grime * dirt.level();
    glassMat.opacity = Math.min(want, GLASS.ceiling) * fade;
  };

  const update = (state: GameState, dt: number, eye?: THREE.Vector3): void => {
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

    // Wheels: the front pair points where the driver points them —
    // counter-steer in a drift shows because the input does — and each wheel
    // turns at the speed of its own contact patch, plus, on the driven axles
    // only, whatever the engine is spinning it beyond that (car-wheels.ts).
    const wantSteer = clamp(car.steer * WHEEL_STEER_LOCK, -WHEEL_STEER_MAX, WHEEL_STEER_MAX);
    steerVisual += (wantSteer - steerVisual) * clamp(WHEEL_STEER_RATE * dt, 0, 1);
    for (let i = 0; i < body.wheelSpin.length; i++) {
      const front = i < 2;
      const speed = wheelSurfaceSpeed(
        car,
        body.wheelGroups[i].position,
        front ? steerVisual : 0,
        front ? driven.front : driven.rear,
      );
      body.wheelSpin[i].rotation.x += (speed * dt) / bodySpec.wheelRadius;
      if (front) body.wheelGroups[i].rotation.y = steerVisual;
    }

    if (body.steering) body.steering.rotation.z = steeringTurn(steerVisual / WHEEL_STEER_LOCK);

    dirt.update(state, dt);
    // The glass answers to both the weather landing on it and the filth the
    // stage has thrown at the rest of the car.
    body.wipers.update(wet, dirt.level(), dt);
    shineGlass(state, eye);
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
    (blob.material as THREE.MeshBasicMaterial).opacity = 0.28 * s * fade;
  };

  const dispose = (): void => {
    damage.dispose();
    body.dispose();
    blob.geometry.dispose();
    (blob.material as THREE.MeshBasicMaterial).dispose();
    for (const geo of lampGeos) geo.dispose();
    lampMat.dispose();
  };

  return {
    group,
    cabin: body.cabin,
    shadow,
    debris: damage.debris,
    update,
    onEvents: damage.onEvents,
    setLights,
    setWet,
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
