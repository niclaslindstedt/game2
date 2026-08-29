// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAMPS THE DUST SEES — a small register of light sources the particle
// clouds are lit from, refilled once a frame and read by every dust
// material's shader (dust.ts).
//
// It exists because the clouds are NOT in the lit scene. Everything the
// world is built from is Lambert under the scene's real lights; a particle
// is a point sprite carrying its own vertex colour, so the sun, the sky and
// the four spotlights on the car all pass straight through it. That is the
// right trade for a thousand puffs — but it is also why a gravel plume at
// midnight is the same tan it is at noon, and why a car with its lamps on
// tows a cloud that does not know they are lit.
//
// So the clouds get their own two-term lighting instead, and it is
// deliberately the cheapest thing that reads:
//
//   AMBIENT — the sky, as the material's own colour (`dustTintFor` in
//   sky.ts). One multiply, and it is what makes a night plume nearly
//   invisible where a noon one is not.
//
//   LAMPS — this register, summed per particle in the vertex shader. Each
//   entry is a cone with a linear reach, which is all a point sprite can
//   tell the difference between: no normals, no shadows, no falloff curve
//   worth the instructions.
//
// A slot is a LAMP, not a car: a car hangs two of them here, one throwing
// forward and one throwing back, because those are the two the dust ever
// sees. And they are one pair per car rather than the four real beams
// (environment.ts splays a pair for each end) — at the size a puff is, two
// sources 1.2 m apart are one source, and halving the count halves the loop
// every particle in the frame runs.

import * as THREE from "three";

/** How many lamps the clouds can see at once: a head and a tail source for
 * each of four cars — the player, who is always in, and the three nearest
 * of the field. Past that a rival is far enough up the road that its own
 * dust is a smudge, and its lamps are a pixel. */
export const DUST_LAMPS = 8;

/** Where the lamp is, xyz — and w, how far its light carries, m. */
const spot = new Float32Array(DUST_LAMPS * 4);
/** Which way it faces, xyz — and w, the cosine of its cone's outer edge. */
const face = new Float32Array(DUST_LAMPS * 4);
/** The light itself: colour times strength. An empty slot is black, so the
 * shader can run the whole register unconditionally and pay one add for
 * the lamps that are not there. */
const glow = new Float32Array(DUST_LAMPS * 3);

/** The uniform objects themselves, shared by REFERENCE across every dust
 * material in the scene — a graft assigns these same three objects, so
 * writing the arrays below is what updates all of them at once. */
export const DUST_LAMP_UNIFORMS = {
  uDustLampSpot: { value: spot },
  uDustLampFace: { value: face },
  uDustLampGlow: { value: glow },
};

/**
 * WHAT A CAR'S TWO LAMPS DO TO THE AIR BEHIND AND AHEAD OF IT.
 *
 * The head source is a driving light: warm, narrow and long, and it is the
 * one that puts a cone of lit dust out in front of a car crossing its own
 * plume. The tail source is a MARKER — the same distinction environment.ts
 * draws for the beams on the ground — so it is short and wide, and its job
 * is done a couple of car lengths back.
 *
 * The GAINS are bounded from BOTH sides, and the tail's is the tight one.
 * The dust a tail lamp lights is the dust directly between the chase camera
 * and the car — the closest, thickest part of the cloud, at the exact spot
 * the eye is already looking. Under-driven it is a pink haze rather than
 * the lamps' own light; over-driven every channel clips and a puff a metre
 * off the lens comes out as a flat patch of pure red, which reads as fire
 * rather than as lit smoke. This is the strength at which the cloud behind
 * the car goes RED and the puffs in it still have shading between them.
 */
const CAR_LAMPS = {
  head: {
    color: 0xffeecb,
    /** Metres along the car's own axis, forward positive. */
    from: 1.4,
    up: 0.75,
    /** Half-angle of the cone, rad. */
    cone: 0.6,
    /** How far below the horizontal it is aimed — a driving beam points at
     * the road, and dust hanging above the beam is not in it. */
    tilt: 0.14,
    reach: 26,
    gain: 1,
  },
  tail: {
    color: 0xff2814,
    from: -1.7,
    up: 0.5,
    cone: 0.9,
    tilt: 0.1,
    reach: 9,
    gain: 0.85,
  },
};

let used = 0;

/** Empty the register. Called once a frame, before anybody writes to it —
 * the whole point of it being one register is that it has one owner of
 * that moment (renderer.ts). */
export function clearDustLamps(): void {
  used = 0;
  glow.fill(0);
}

const heading = new THREE.Vector3();
const hue = new THREE.Color();

function put(
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  lamp: { color: number; cone: number; reach: number; gain: number },
  strength: number,
): void {
  // A lamp too dim to change a pixel still costs every particle in the
  // frame a cone and a falloff, so it does not take a slot from one that
  // would.
  if (used >= DUST_LAMPS || strength * lamp.gain < 0.02) return;
  const i = used++;
  spot[i * 4] = x;
  spot[i * 4 + 1] = y;
  spot[i * 4 + 2] = z;
  spot[i * 4 + 3] = lamp.reach;
  heading.set(dx, dy, dz).normalize();
  face[i * 4] = heading.x;
  face[i * 4 + 1] = heading.y;
  face[i * 4 + 2] = heading.z;
  face[i * 4 + 3] = Math.cos(lamp.cone);
  hue.set(lamp.color);
  glow[i * 3] = hue.r * strength * lamp.gain;
  glow[i * 3 + 1] = hue.g * strength * lamp.gain;
  glow[i * 3 + 2] = hue.b * strength * lamp.gain;
}

/**
 * Hang one car's pair on the register: `head` and `tail` are how much light
 * each end is actually throwing, 0..1 — nothing under a midday sky, full
 * with the lamps lit at night, and less than that through a caked lens.
 *
 * Order is priority. The register fills front to back and silently drops
 * what will not fit, so whoever matters most goes first.
 */
export function lightDust(
  car: { x: number; y: number; z: number; heading: number },
  head: number,
  tail: number,
): void {
  const fwdX = Math.sin(car.heading);
  const fwdZ = Math.cos(car.heading);
  const H = CAR_LAMPS.head;
  const T = CAR_LAMPS.tail;
  put(car.x + fwdX * H.from, car.y + H.up, car.z + fwdZ * H.from, fwdX, -H.tilt, fwdZ, H, head);
  put(car.x + fwdX * T.from, car.y + T.up, car.z + fwdZ * T.from, -fwdX, -T.tilt, -fwdZ, T, tail);
}
