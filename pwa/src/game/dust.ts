// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pooled particle system for the ground-contact juice: gravel thrown off
// the wheels, a blue sheet of spray through fords, a brown puff on
// landings — and, on the stage's asphalt sections, tire smoke, which is a
// different thing entirely and has to LOOK like one. One THREE.Points
// cloud per style, positions and lifetimes recycled in place.

import * as THREE from "three";

const POOL = 768;

/** What a cloud is MADE of. The two styles are opposites on purpose: a
 * grain of gravel is small, hard, and thrown — dozens of them, arcing and
 * falling; smoke is big, soft, and boiled off the tire — a few of them,
 * hanging and drifting. Same code, different matter. */
export type DustStyle = {
  /** Point size, world meters. */
  size: number;
  opacity: number;
  /** Upward speed a particle is born with, m/s. */
  rise: number;
  /** Downward acceleration, m/s² — grit falls, smoke barely does. */
  gravity: number;
  /** Lifetime band, seconds. */
  life: { min: number; max: number };
};

/** Gravel: fine grit, and a lot of it. The grains are deliberately SMALL —
 * near the lowered chase cam a big point sprite reads as a glitchy square,
 * where a swarm of small ones reads as spray. */
export const GRAVEL_DUST: DustStyle = {
  size: 0.075,
  opacity: 0.85,
  rise: 1.5,
  gravity: 6,
  life: { min: 0.5, max: 0.9 },
};

/** Tire smoke: what a sealed road gives you instead. Big soft puffs that
 * hang where they were made and drift off with the car's wake, so a drift
 * on tarmac leaves a wall behind it rather than a rooster tail. */
export const TIRE_SMOKE: DustStyle = {
  size: 0.62,
  opacity: 0.3,
  rise: 0.7,
  gravity: 0.4,
  life: { min: 1, max: 1.9 },
};

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

export function createDust(style: DustStyle = GRAVEL_DUST): Dust {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const velocities = new Float32Array(POOL * 3);
  const life = new Float32Array(POOL);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: style.size,
    vertexColors: true,
    transparent: true,
    opacity: style.opacity,
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
      velocities[i * 3 + 1] = style.rise + Math.random() * spread;
      velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      colors[i * 3] = tint.r * (0.85 + Math.random() * 0.3);
      colors[i * 3 + 1] = tint.g * (0.85 + Math.random() * 0.3);
      colors[i * 3 + 2] = tint.b * (0.85 + Math.random() * 0.3);
      life[i] = style.life.min + Math.random() * (style.life.max - style.life.min);
    }
  };

  const update = (dt: number): void => {
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      velocities[i * 3 + 1] -= style.gravity * dt;
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
