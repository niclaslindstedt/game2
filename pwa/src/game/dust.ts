// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pooled particle system for the ground-contact juice: gravel thrown off
// the wheels, a blue sheet of spray through fords, a brown puff on
// landings — and, on the stage's asphalt sections, tire smoke, which is a
// different thing entirely and has to LOOK like one. One THREE.Points
// cloud per style, positions and lifetimes recycled in place.

import * as THREE from "three";

import { puffTexture } from "./textures.ts";

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
  /** A cloud made of PUFFS rather than grains: its points wear a blob mask
   * instead of the sprite's bare square, which is the only way a particle
   * gets to be big enough to read as smoke. */
  puffy?: boolean;
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
 * on tarmac leaves a wall behind it rather than a rooster tail. Big is only
 * available to it because it is `puffy`: the chase cam sits a couple of
 * metres behind the tires that make these, and at that range a bare sprite
 * this size is a grey rectangle stuck to the lens. */
export const TIRE_SMOKE: DustStyle = {
  size: 0.55,
  opacity: 0.26,
  rise: 0.7,
  gravity: 0.4,
  life: { min: 1, max: 1.9 },
  puffy: true,
};

/** WHEN a sealed road smokes — the policy that goes with the style above.
 * Tarmac has nothing lying on it to throw, so unlike gravel it gives up
 * nothing at all for ordinary driving, however hard it is being driven.
 * Smoke is what a tire gives when it is genuinely overwhelmed, and there
 * are only three moments that qualify: spinning up on the line, a committed
 * drift, and a real stop from real speed. Each of them leaves a little. */
export const TARMAC_SMOKE = {
  /** Seconds between puffs — a quarter of the loose surface's rate, so a
   * drift leaves a haze hanging in the corner rather than a bank of fog. */
  every: 0.12,
  /** Pulling away: forward acceleration in m/s² under `speed` m/s that
   * reads as the driven wheels spinning up before they hook up. */
  launch: { accel: 4.5, speed: 7, puffs: 3 },
  /** A committed drift: `puffs` per outside wheel, plus a little for how
   * deep the slide has gone. */
  drift: { puffs: 2 },
  /** Braking: `puffs` off ONE wheel, and only from a speed worth losing
   * (m/s) — a dab into a corner does not lock anything up. */
  brake: { speed: 24, puffs: 2 },
  /** Smoke boils off the tire rather than being thrown by it, so it spreads
   * gently instead of arcing away, m/s. */
  spread: 1.2,
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
  const map = style.puffy ? puffTexture() : null;
  const mat = new THREE.PointsMaterial({
    size: style.size,
    map,
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
    map?.dispose();
  };

  // Park the whole pool out of sight until first use.
  for (let i = 0; i < POOL; i++) positions[i * 3 + 1] = -50;

  return { points, spawn, update, dispose };
}
