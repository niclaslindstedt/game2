// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pooled particle system for the juice: gravel dust while drifting, a
// blue sheet of spray through fords, a brown puff on landings. One
// THREE.Points cloud, positions and lifetimes recycled in place.

import * as THREE from "three";

const POOL = 768;

export type Dust = {
  points: THREE.Points;
  /** `vx`/`vz` seed every particle with a base world velocity (the car's
   * wake) on top of the random spread. */
  spawn: (
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    spread: number,
    vx?: number,
    vz?: number,
  ) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function createDust(): Dust {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const velocities = new Float32Array(POOL * 3);
  const life = new Float32Array(POOL);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    // Small grains, many of them: near the lowered chase cam a big point
    // sprite reads as a glitchy square, a swarm of small ones as spray.
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const tint = new THREE.Color();

  const spawn = (
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    spread: number,
    vx = 0,
    vz = 0,
  ): void => {
    tint.set(color);
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % POOL;
      positions[i * 3] = x + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = y + Math.random() * 0.3;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      velocities[i * 3] = vx + (Math.random() - 0.5) * spread;
      velocities[i * 3 + 1] = 1.5 + Math.random() * spread;
      velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      colors[i * 3] = tint.r * (0.85 + Math.random() * 0.3);
      colors[i * 3 + 1] = tint.g * (0.85 + Math.random() * 0.3);
      colors[i * 3 + 2] = tint.b * (0.85 + Math.random() * 0.3);
      life[i] = 0.5 + Math.random() * 0.4;
    }
  };

  const update = (dt: number): void => {
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      velocities[i * 3 + 1] -= 6 * dt;
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (life[i] <= 0) positions[i * 3 + 1] = -50; // park expired below ground
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  // Park the whole pool out of sight until first use.
  for (let i = 0; i < POOL; i++) positions[i * 3 + 1] = -50;

  return { points, spawn, update, dispose };
}
