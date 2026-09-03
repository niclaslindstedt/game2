// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MARSHAL'S CONES — the plastic beside the road, and the one thing a
// player expects of plastic: that it goes flying. And, on the same terms,
// everything else a marshal puts down that a car is allowed to scatter: the
// tyre stacks, round bales and oil drums shutting an abandoned branch, which
// `blockade.ts` builds and plants here.
//
// A cone is NOT an engine prop. Everything the physics collides with is
// placed by the engine and only drawn app-side (world.ts), because collision
// and drawing have to agree; a cone agrees with nothing, because it stops
// nothing. It weighs a kilo, the car does not notice it, and the run is
// identical whether it was hit or not — which is exactly why it can live out
// here in the renderer with no engine state, no determinism to keep, and no
// sim column to move. What it owes is the LOOK: drive through a line of them
// and they scatter, arc, land and lie there.
//
// So this module owns both halves — planting them (the pairs flanking a jump
// lip, the block across an abandoned branch) and knocking them, against the
// same body box the engine collides the car with so a cone goes over exactly
// when the car's panels would have touched it.

import * as THREE from "three";
import { type GameState, type Track } from "@engine";

import { rightOf } from "./ribbon.ts";
import { drivingThrough, outOfBody, stepTumble, tumbleFrom, type TumbleBody } from "./tumble.ts";

/** Cone dimensions, m — base radius and height. */
const CONE_R = 0.45;
const CONE_H = 1.1;
/** ...and the TALL marker's, the metre-and-a-half channelizer a course is
 * actually laid out with. The ordinary cone marks a lip you are already
 * committed to; this one marks a line you are still choosing, which is why
 * it has to be visible over the bonnet from a hundred metres out. */
const TALL_R = 0.34;
const TALL_H = 1.6;
/** Where a marker's own origin sits over the ground while it is standing is
 * simply its middle, whichever of the two it is. Lying on its side it is
 * half its own base radius up. */
const LYING = CONE_R * 0.5;

/** How far out the contact test grows the car's body box, m — a cone is a
 * circle rather than a point, and a wheel brushing one is still a hit. */
const REACH = CONE_R;
/** Below this the car is not driving through anything, m/s — without it a
 * cone lying under a parked car is re-launched every frame. */
const KNOCK_FROM = 1.2;

/** Fraction of the car's speed a struck cone leaves with. A cone is nothing
 * and the car is a tonne, so the cone takes the speed and the car keeps it. */
const KICK = 0.62;
/** …with this much of it as lift, plus a floor so a crawl still tips one. */
const LOFT = 0.16;
const LOFT_MIN = 1.8;
/** Cap on how fast a cone leaves, m/s — past this it reads as a bullet. */
const KICK_MAX = 22;
/** How hard a struck cone tumbles, rad/s per m/s of the speed it left at. */
const SPIN = 0.9;

type Cone = {
  body: TumbleBody;
  /** Where on the stage it stands, m — what an endless run's prune reads. */
  s: number;
  /** Awake bodies are stepped every frame; a settled one only wakes if the
   * car comes back and hits it again. */
  live: boolean;
  /** How far out from the object's own centre the contact test reaches, and
   * how tall it stands — a cone's, unless the caller planted something else.
   * A stack of tyres is four times the cone's footprint and a hay bale
   * twice its height, and a barrier the car drives THROUGH without touching
   * is not a barrier. */
  reach: number;
  height: number;
};

export type ConeField = {
  /** The group every cone is drawn in — a sibling of the road chunks, so a
   * chunk being dropped never takes a cone that is mid-flight with it. */
  group: THREE.Group;
  /** Stand a cone up at a world point, `s` metres into the stage. `tall`
   * picks the channelizer over the ordinary cone — same weight, same
   * scatter, more of it above the bonnet line. */
  plant: (x: number, y: number, z: number, s: number, tall?: boolean) => void;
  /** ...and stand something that is NOT a cone: a stack of tyres, a round
   * bale, an oil drum (blockade.ts). The object is taken over whole — the
   * caller has already built and placed it — and from here it is knocked,
   * tumbled and pruned exactly as a cone is. `rest` is how far its centre
   * sits over the ground once it has stopped rolling. */
  plantProp: (object: THREE.Object3D, s: number, shape: PropShape) => void;
  /** Cones the endless prune has left behind: everything up to `s`. */
  retireBefore: (s: number) => void;
  /** Knock whatever the car is driving through, and tumble what is loose.
   * `knocked` is raised once per cone sent flying, with the speed it left
   * at — a cone makes a noise, and the engine has never heard of one. */
  update: (state: GameState, dt: number, knocked?: (speed: number) => void) => void;
  dispose: () => void;
};

/** What a planted thing is, to the contact test and to gravity: how far out
 * its footprint reaches, how tall it stands, and how far its centre sits
 * over the ground once it has come to rest lying down. */
export type PropShape = { reach: number; height: number; rest: number };

export function createConeField(): ConeField {
  const group = new THREE.Group();
  const geometry = new THREE.ConeGeometry(CONE_R, CONE_H, 6);
  const tallGeometry = new THREE.CylinderGeometry(TALL_R * 0.55, TALL_R, TALL_H, 7);
  const material = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  let cones: Cone[] = [];

  const plant = (x: number, y: number, z: number, s: number, tall = false): void => {
    const mesh = new THREE.Mesh(tall ? tallGeometry : geometry, material);
    const height = tall ? TALL_H : CONE_H;
    mesh.position.set(x, y + height / 2, z);
    mesh.rotation.y = Math.random() * Math.PI;
    group.add(mesh);
    cones.push({
      body: tumbleFrom(mesh, new THREE.Vector3(), new THREE.Vector3(), tall ? TALL_R : LYING),
      s,
      live: false,
      reach: tall ? TALL_R : REACH,
      height,
    });
  };

  const plantProp = (object: THREE.Object3D, s: number, shape: PropShape): void => {
    group.add(object);
    cones.push({
      body: tumbleFrom(object, new THREE.Vector3(), new THREE.Vector3(), shape.rest),
      s,
      live: false,
      reach: shape.reach,
      height: shape.height,
    });
  };

  /** Send one cone on its way, at the speed and in the direction the car was
   * going, pushed out along the line from the car's flank to the cone so a
   * clipped one goes sideways rather than straight down the road. */
  const knock = (cone: Cone, state: GameState, outX: number, outZ: number): number => {
    const car = state.car;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const vx = sinH * car.u + cosH * car.w;
    const vz = cosH * car.u - sinH * car.w;
    const speed = Math.min(KICK_MAX, Math.hypot(vx, vz) * KICK);
    const push = Math.hypot(outX, outZ) || 1;
    // Two thirds the way the car is travelling, one third straight out of
    // its side — a cone hit square goes down the road, a clipped one spins
    // off the flank.
    const dirX = ((vx / (Math.hypot(vx, vz) || 1)) * 2 + outX / push) / 3;
    const dirZ = ((vz / (Math.hypot(vx, vz) || 1)) * 2 + outZ / push) / 3;
    const body = cone.body;
    body.asleep = false;
    body.vel.set(dirX * speed, LOFT_MIN + speed * LOFT, dirZ * speed);
    body.spin.set(
      (Math.random() - 0.5) * speed * SPIN,
      (Math.random() - 0.5) * speed * SPIN * 0.5,
      (Math.random() - 0.5) * speed * SPIN,
    );
    cone.live = true;
    return speed;
  };

  const update = (state: GameState, dt: number, knocked?: (speed: number) => void): void => {
    const car = state.car;
    const ground = state.terrain.groundAt;
    const driving = !car.airborne && Math.hypot(car.u, car.w) > KNOCK_FROM;

    for (const cone of cones) {
      const p = cone.body.object.position;
      if (driving) {
        const hit = drivingThrough(car, p.x, p.y, p.z, cone.reach, cone.height);
        if (hit) {
          const out = outOfBody(car, hit, cone.reach);
          // The knock happens whether or not anybody is listening: an
          // optional call does not evaluate its arguments, so putting the
          // work inside `knocked?.(…)` would leave the cones standing
          // wherever the caller passed no handler.
          const speed = knock(cone, state, out.x, out.z);
          knocked?.(speed);
        }
      }
      if (cone.live && !stepTumble(cone.body, dt, ground)) cone.live = false;
    }
  };

  const retireBefore = (s: number): void => {
    const kept: Cone[] = [];
    for (const cone of cones) {
      if (cone.s > s) {
        kept.push(cone);
        continue;
      }
      group.remove(cone.body.object);
    }
    cones = kept;
  };

  const dispose = (): void => {
    group.clear();
    cones = [];
    geometry.dispose();
    tallGeometry.dispose();
    material.dispose();
  };

  return { group, plant, plantProp, retireBefore, update, dispose };
}

/** The pairs flanking every jump lip in a stretch of road. */
export function plantJumpCones(field: ConeField, track: Track, from: number, to: number): void {
  const half = track.width / 2;
  for (let i = from; i < to; i++) {
    const s = track.samples[i];
    if (!s.jump) continue;
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      field.plant(
        s.x + r.x * (half + 0.8) * side,
        s.elevation,
        s.z + r.z * (half + 0.8) * side,
        s.s,
      );
    }
  }
}
