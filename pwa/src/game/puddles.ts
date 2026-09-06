// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PUDDLES — the standing water a WET SEASON leaves on a country that has no
// water table to drain into (climate.ts, `rainsIn`: the desert's winter).
// A lake is the engine's — poured, levelled, cut against the ground
// (terrain.ts) — and a country with no water has none; what its rain
// leaves is a few days of sheet water in every flat: the pans, the
// pavement between the creosote, the hollow of a wash. Drawn as flat
// discs of the app's one water look, laid on the ground where it is level
// enough to hold water and off the road, one instanced mesh per ground
// tile, seeded from the tile, so a puddle is where it was last time.
//
// Look only. The road is dry to the physics (the wet twin of the surface
// is the WEATHER's, weather.ts), and the discs are kept off the mat so a
// puddle is never a thing the car drives through without a splash.

import * as THREE from "three";
import { createRng } from "@engine";

/** Discs tried per tile, and how many an ordinary tile actually gets: a
 * scatter, not a flood. */
const TRIES = 110;
const CHANCE = 0.6;
/** A puddle's radius, m, and how much rounder than a circle it is not. */
const RADIUS = { min: 1.2, max: 3.2 };
const SQUASH = 0.6;
/** The most the ground may fall across a puddle for it to hold water: a
 * pan is flat, a slope drains. Metres per metre over the disc's radius. */
const LEVEL = 0.03;
/** Lifted off the ground by this much, m, so it draws over the tile rather
 * than fighting it — under the reach of any ground cover. */
const LIFT = 0.04;
/** How many sides a disc has. */
const SIDES = 10;

export type PuddleGround = {
  /** The drawn ground at a point — the ridden lattice, so a disc sits on
   * the tile it is laid over. */
  heightAt: (x: number, z: number) => number;
  /** Distance to the stage's centreline, m. */
  roadDistanceAt: (x: number, z: number) => number;
  /** Clearance from any other road or pad, m, negative on it. */
  spurClearance: (x: number, z: number) => number;
  /** Half the road's width plus its verge: no puddle inside it. */
  keepOff: number;
};

/** The puddles on one tile, or null where none of the tile holds water. */
export function buildPuddles(
  originX: number,
  originZ: number,
  span: number,
  seed: number,
  ground: PuddleGround,
  material: THREE.Material,
): THREE.Mesh | null {
  const rng = createRng((seed ^ ((originX * 73856093) ^ (originZ * 19349663))) >>> 0);
  const positions: number[] = [];
  const index: number[] = [];
  for (let t = 0; t < TRIES; t++) {
    const x = originX + rng.range(0, span);
    const z = originZ + rng.range(0, span);
    if (!rng.chance(CHANCE)) continue;
    if (ground.roadDistanceAt(x, z) < ground.keepOff) continue;
    if (ground.spurClearance(x, z) < 1) continue;
    const r = rng.range(RADIUS.min, RADIUS.max);
    const y = ground.heightAt(x, z);
    // Level enough to hold water: the ground across the disc within a few
    // centimetres of its centre.
    let flat = true;
    for (let k = 0; k < 4 && flat; k++) {
      const a = (k / 4) * Math.PI * 2;
      const dy = ground.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) - y;
      if (Math.abs(dy) > LEVEL * r) flat = false;
    }
    if (!flat) continue;
    const spin = rng.range(0, Math.PI * 2);
    const squash = rng.range(SQUASH, 1);
    const base = positions.length / 3;
    positions.push(x, y + LIFT, z);
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      // A ragged rim: a puddle's edge follows the ground, not a compass.
      const rr = r * (0.8 + 0.2 * rng.next());
      const px = Math.cos(a) * rr;
      const pz = Math.sin(a) * rr * squash;
      const wx = x + px * Math.cos(spin) - pz * Math.sin(spin);
      const wz = z + px * Math.sin(spin) + pz * Math.cos(spin);
      // Each rim point on ITS OWN ground: the pan is level to a few
      // centimetres, and a disc held at the centre's height is under the
      // tile wherever the ground rises across it — sheet water follows the
      // sheet it stands on.
      positions.push(wx, ground.heightAt(wx, wz) + LIFT, wz);
    }
    for (let s = 0; s < SIDES; s++) {
      index.push(base, base + 1 + ((s + 1) % SIDES), base + 1 + s);
    }
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Flat water: one normal, straight up, and the UVs the water look drifts
  // its ripple over, in world metres like the lakes'.
  const n = positions.length / 3;
  const normals = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    normals[i * 3 + 1] = 1;
    uvs[i * 2] = positions[i * 3] / 8;
    uvs[i * 2 + 1] = positions[i * 3 + 2] / 8;
  }
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}
