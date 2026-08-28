// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Exhaust fumes: a pooled puff cloud off the tailpipe. Puffs inherit a
// little of the car's wake, then the WIND owns them — idling fumes drift
// downwind, a storm rips them sideways. Same recycled-in-place Points
// architecture as dust.ts; presentation only.

import * as THREE from "three";

import { puffTexture } from "./textures.ts";

/** Big enough to hold a full second of the hardest the pipe ever works —
 * the grid's redline burst — without recycling a puff that is still on
 * screen, which would show up as the cloud tearing holes in itself at
 * exactly the moment it is thickest. */
const POOL = 384;

/**
 * WHAT THE PIPE DOES WITH THE THROTTLE. Fuel burned is fumes made, so the
 * exhaust answers the ENGINE and not the speedometer — which is why the
 * grid, where the car is going nowhere at all, is not the quietest place on
 * the stage.
 */
export const EXHAUST = {
  /** Seconds between puffs: sitting at idle, rolling, and on the boost —
   * the richest the engine ever runs. */
  every: { idle: 0.12, rolling: 0.045, boost: 0.02 },
  /** How sooty the cloud is, 0 pale .. 1 black. `base` is a cold idle,
   * darkening by `pace` as road speed comes up to `paceAt` m/s. */
  shade: { base: 0.35, pace: 0.4, paceAt: 30, boost: 0.9 },
  /** REVVING ON THE GRID: the throttle blipped against a car that cannot
   * move. None of the fuel it drinks becomes road speed, so all of it
   * leaves through the pipe — the one moment the exhaust is the loudest
   * thing on screen. Below `from` on the rev counter the engine is merely
   * idling and none of this applies; at the redline the puffs come `every`
   * seconds (quicker than the boost's), `puffs` at a time so a blip reads
   * as a BURST rather than a tick, at `shade` soot. `blast` is what pushes
   * them out of the pipe, m/s, in place of a car pulling away from them:
   * gentle, because a stationary car's cloud has to BILLOW and hang around
   * the back of it — anything jetted hard streams straight past the chase
   * camera and leaves the start line looking clean. */
  rev: { from: 0.12, every: 0.016, puffs: 4, shade: 0.85, blast: 1.4 },
};

export type Fumes = {
  points: THREE.Points;
  /** One puff at the pipe. `vx`/`vz` seed the base velocity (wake + wind);
   * `shade` 0–1 picks idle-pale → boost-dark soot. */
  spawn: (x: number, y: number, z: number, vx: number, vz: number, shade: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function createFumes(): Fumes {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const velocities = new Float32Array(POOL * 3);
  const life = new Float32Array(POOL);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Exhaust is SMOKE, not grit, so it takes the same answer tire smoke does
  // to the low chase cam: a puff big enough to read gets a lumpy MASK
  // (textures.ts) rather than being shrunk into a speck. Shrinking is what
  // grains want; a smoke sprite made small enough not to look like a square
  // just stops looking like smoke, and a whole pipe's worth of them
  // disappears against the road.
  const map = puffTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.55,
    map,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const pale = new THREE.Color(0x9aa0a8);
  const soot = new THREE.Color(0x3c4046);
  const tint = new THREE.Color();

  const spawn = (x: number, y: number, z: number, vx: number, vz: number, shade: number): void => {
    const i = cursor;
    cursor = (cursor + 1) % POOL;
    positions[i * 3] = x + (Math.random() - 0.5) * 0.2;
    positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.15;
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
    // A wide scatter, so a burst of puffs made in the same millisecond at
    // the same pipe FANS rather than travelling out as one rope.
    velocities[i * 3] = vx + (Math.random() - 0.5) * 0.9;
    velocities[i * 3 + 1] = 0.6 + Math.random() * 0.6; // warm smoke rises
    velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * 0.9;
    tint.copy(pale).lerp(soot, shade);
    const v = 0.85 + Math.random() * 0.3;
    colors[i * 3] = tint.r * v;
    colors[i * 3 + 1] = tint.g * v;
    colors[i * 3 + 2] = tint.b * v;
    life[i] = 0.8 + Math.random() * 0.6;
  };

  const update = (dt: number): void => {
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      // No gravity — smoke hangs, slows its rise, and rides whatever wind
      // was baked into its spawn velocity.
      velocities[i * 3 + 1] = Math.max(0.15, velocities[i * 3 + 1] - 0.5 * dt);
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (life[i] <= 0) positions[i * 3 + 1] = -50;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
    map.dispose();
  };

  for (let i = 0; i < POOL; i++) positions[i * 3 + 1] = -50;
  return { points, spawn, update, dispose };
}
