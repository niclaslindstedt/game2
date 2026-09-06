// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PLAYER'S LAMPS ON THE WORLD — the spotlights the car's headlights and
// tail lights throw on the road, and what daylight, grime and a crash leave
// of them. The lamps themselves are car-mesh.ts's (the bowl, the bloom);
// this is the light they cast, which the Lambert world picks up and the
// fullbright car correctly ignores.
//
// Lights come in PAIRS, because a car has two of each. One beam on the
// centerline throws a single symmetric pool that never breaks up, and the
// eye reads it as a searchlight bolted to the roof rather than as the car's
// own lamps. Two beams, splayed so their cones cross a few metres out, give
// the double-lobed pool a car actually lays down — and they sit where the
// lenses are, so a wide car lights a wide road.

import * as THREE from "three";

import { LAMP_BEAMS, type VideoSettings } from "./settings.ts";
import { clamp } from "../lib/util.ts";

/** How much of each pair's light a fully caked lens costs, 0..1. The tail
 * lamp loses more of what little it has: the front is a deep reflector
 * behind glass, the rear a flat lens right above the wheel that throws the
 * gravel. */
const HEAD_GRIME = 0.45;
const TAIL_GRIME = 0.6;

/** A single beam standing in for a pair is opened out and driven harder,
 * so the one pool it lays covers about what the two splayed lobes did and
 * the road under it is about as bright where they overlapped. The pool is
 * rounder and it reads as one lamp on the roofline rather than two on the
 * wings — which is the look this stop of the row trades for half its
 * cost. */
const SINGLE_BEAM_ANGLE = { head: 0.52, tail: 0.95 };
const SINGLE_BEAM_GAIN = 1.5;
const PAIR_ANGLE = { head: 0.42, tail: 0.8 };

/** Point one pair — or the one beam of it that is thrown. Each beam sits
 * `spread` off the centerline `from` metres along the car's own axis
 * (negative is behind it) and `up` above the contact patch, aiming `to`
 * metres out and `down` below it — plus `splay` further out to the side,
 * which is the whole reason there are two. A single beam sits on the
 * centerline and aims straight down it. */
type Aim = {
  intensity: number;
  spread: number;
  from: number;
  up: number;
  to: number;
  down: number;
  splay: number;
};

export type CarLamps = {
  /** The video options' LIGHTING row: how many beams each end throws
   * (`LAMP_BEAMS`). */
  setLighting: (level: VideoSettings["lighting"]) => void;
  /** Whether the lamps are on at all — the sky's switch. A hidden
   * spotlight leaves the shader as well as the picture (three.js compiles
   * the lit materials against however many lights are visible), so an
   * unlit stage costs no beams at all, whatever the row says. */
  setLit: (lit: boolean) => void;
  /** How far off the centerline each lamp sits, m — front and rear
   * (car-body.ts owns the anchors). */
  setSpread: (front: number, rear: number) => void;
  /** How filthy the car is, 0..1 — the lenses are under the same coat as
   * the paint, so both beams fade as the stage goes on. */
  setGrime: (level: number) => void;
  /** How much of each end's lighting the crash has left, 0..1 — a share,
   * not a switch, because the lamps break one at a time. */
  setBroken: (front: number, rear: number) => void;
  /** Aim the lit pairs at the car, at `power` of full (the daylight's
   * say). Headlights track the nose, tail lamps the tail; each lamp of a
   * pair carries half the intensity the pair is worth, so the road ahead
   * is lit by two beams rather than by twice as much light. */
  aim: (car: { x: number; y: number; z: number; heading: number }, power: number) => void;
  /** What is left of each end for the dust to be lit by, at `power`:
   * the same arithmetic the spotlights use, so a cloud is lit by lamps
   * that are actually there. */
  shares: (power: number) => { front: number; rear: number };
  dispose: () => void;
};

export function createCarLamps(scene: THREE.Scene): CarLamps {
  const beam = (color: number, distance: number, angle: number): THREE.SpotLight => {
    const light = new THREE.SpotLight(color, 0, distance, angle, 0.6, 1.2);
    light.visible = false;
    scene.add(light, light.target);
    return light;
  };
  // Headlights: warm, long, and narrow enough that the pair reads as two.
  const headlights = [beam(0xffeecb, 70, 0.42), beam(0xffeecb, 70, 0.42)];
  // ...and the tail lamps' own wash on the ground behind. A tail light is
  // a MARKER, not a driving light — it exists to be seen, not to see by —
  // so it is a fraction of the beam ahead and reaches a few car lengths at
  // most: enough that the road behind a car at night is red, never enough
  // to light the way out of a corner backwards. It comes on with the
  // headlights, because that is the switch it is wired to.
  const taillights = [beam(0xff2814, 18, 0.8), beam(0xff2814, 18, 0.8)];

  let beams = LAMP_BEAMS.full;
  let lit = false;
  let headSpread = 0.6;
  let tailSpread = 0.55;
  let grime = 0;
  let headLamps = 1;
  let tailLamps = 1;

  const applyLamps = (): void => {
    for (let i = 0; i < 2; i++) {
      headlights[i].visible = lit && i < beams.head;
      taillights[i].visible = lit && i < beams.tail;
    }
    headlights[0].angle = beams.head === 1 ? SINGLE_BEAM_ANGLE.head : PAIR_ANGLE.head;
    taillights[0].angle = beams.tail === 1 ? SINGLE_BEAM_ANGLE.tail : PAIR_ANGLE.tail;
  };

  const aimPair = (
    pair: THREE.SpotLight[],
    count: number,
    car: { x: number; y: number; z: number },
    fwd: { x: number; z: number },
    right: { x: number; z: number },
    aim: Aim,
  ): void => {
    for (let i = 0; i < count; i++) {
      const side = count === 1 ? 0 : i === 0 ? -1 : 1;
      const light = pair[i];
      light.intensity = aim.intensity * (count === 1 ? SINGLE_BEAM_GAIN : 1);
      light.position.set(
        car.x + fwd.x * aim.from + right.x * side * aim.spread,
        car.y + aim.up,
        car.z + fwd.z * aim.from + right.z * side * aim.spread,
      );
      light.target.position.set(
        car.x + fwd.x * aim.to + right.x * side * aim.splay,
        car.y + aim.down,
        car.z + fwd.z * aim.to + right.z * side * aim.splay,
      );
    }
  };

  const shares = (power: number): { front: number; rear: number } => ({
    front: power * (1 - HEAD_GRIME * grime) * headLamps,
    rear: power * (1 - TAIL_GRIME * grime) * tailLamps,
  });

  return {
    setLighting: (level) => {
      beams = LAMP_BEAMS[level];
      applyLamps();
    },
    setLit: (next) => {
      lit = next;
      applyLamps();
    },
    setSpread: (front, rear) => {
      headSpread = front;
      tailSpread = rear;
    },
    setGrime: (level) => {
      grime = clamp(level, 0, 1);
    },
    setBroken: (front, rear) => {
      headLamps = clamp(front, 0, 1);
      tailLamps = clamp(rear, 0, 1);
    },
    aim: (car, power) => {
      if (!lit) return;
      const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      const right = { x: fwd.z, z: -fwd.x };
      const { front, rear } = shares(power);
      aimPair(headlights, beams.head, car, fwd, right, {
        intensity: 150 * front,
        spread: headSpread,
        from: 1.4,
        up: 0.8,
        to: 32,
        down: -1.5,
        splay: 5,
      });
      aimPair(taillights, beams.tail, car, fwd, right, {
        intensity: 20 * rear,
        spread: tailSpread,
        from: -1.6,
        up: 0.55,
        to: -8,
        down: -1,
        splay: 2.2,
      });
    },
    shares,
    dispose: () => {
      for (const lamp of [...headlights, ...taillights]) lamp.dispose();
    },
  };
}
