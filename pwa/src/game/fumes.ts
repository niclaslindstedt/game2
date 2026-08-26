// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Exhaust fumes: a pooled puff cloud off the tailpipe. Puffs inherit a
// little of the car's wake, then the WIND owns them — idling fumes drift
// downwind, a storm rips them sideways. Same recycled-in-place Points
// architecture as dust.ts; presentation only.

import * as THREE from "three";

const POOL = 192;

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
  // Small grains, like dust.ts: near the low chase cam a big point sprite
  // reads as a glitchy square, not smoke.
  const mat = new THREE.PointsMaterial({
    size: 0.16,
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
    velocities[i * 3] = vx + (Math.random() - 0.5) * 0.5;
    velocities[i * 3 + 1] = 0.6 + Math.random() * 0.5; // warm smoke rises
    velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * 0.5;
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
  };

  for (let i = 0; i < POOL; i++) positions[i * 3 + 1] = -50;
  return { points, spawn, update, dispose };
}
