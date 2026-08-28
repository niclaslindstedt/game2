// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The streams' water surfaces. The stream GEOMETRY — where each watercourse
// runs, how its valley is carved, what stands clear of it — lives in the
// engine's terrain field (the car can drive into a stream, so the physics
// owns it); this module only draws the ribbons over the polylines the
// field computed.
//
// And it draws them only where the field says there IS water. A channel
// narrower than the ground lattice can hold runs under a hillside the
// tiles never dip into: the physics has nothing to drown in there, and a
// sheet drawn across it anyway is the slab of water lying on a mountain
// that gives the whole landscape away. So every cross-section is trimmed
// to the wet ground under it, and a reach with none pinches out.

import * as THREE from "three";
import type { Stream } from "@engine";

export type { Stream };

/** Water surface height over a point, or null on dry ground — the engine
 * field's own answer (TerrainField.waterAt). */
type WaterAt = (x: number, z: number) => number | null;

/** How many steps out from the centerline a cross-section is tested on.
 * The water's edge lands within a fraction of the half-width of where the
 * ground actually leaves it, which is closer than the eye reads at speed. */
const EDGE_STEPS = 6;

/** How far out on one side of a point the ground is still under water, in
 * meters — 0 when the water's own centerline has land over it. */
function wetReach(
  waterAt: WaterAt,
  x: number,
  z: number,
  nx: number,
  nz: number,
  w: number,
): number {
  let out = 0;
  for (let i = 1; i <= EDGE_STEPS; i++) {
    const d = (w * i) / EDGE_STEPS;
    if (waterAt(x + nx * d, z + nz * d) === null) break;
    out = d;
  }
  return out;
}

/** The water surfaces: one ribbon per WET run of each piece of river, as
 * wide as the water is there, lifted a hair above the carved bed. Shares
 * the ford sheets' material look (Phong — the sun glitters on it). */
export function buildStreamMeshes(
  streams: Stream[],
  texture: THREE.Texture,
  waterAt: WaterAt,
): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({
    map: texture,
    specular: 0xcfe4ff,
    shininess: 120,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  for (const s of streams) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const n = s.points.length;
    // How many points of the current wet run are already in the buffer —
    // a dry point ends the run, and the next wet one starts a new strip.
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = s.points[i];
      const q = s.points[Math.min(n - 1, i + 1)];
      const o = s.points[Math.max(0, i - 1)];
      let dx = q.x - o.x;
      let dz = q.z - o.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // The width is the WATER's own, point by point: a river is a trickle
      // at its spring and broad at its mouth (R18), and the shape of that
      // is the river's to say, not the ribbon builder's — trimmed, on each
      // side, to the ground that is actually under water.
      const left = wetReach(waterAt, p.x, p.z, -dz, dx, p.w);
      const right = wetReach(waterAt, p.x, p.z, dz, -dx, p.w);
      if (left <= 0 && right <= 0) {
        run = 0;
        continue;
      }
      positions.push(
        p.x - dz * left,
        p.y + 0.07,
        p.z + dx * left,
        p.x + dz * right,
        p.y + 0.07,
        p.z - dx * right,
      );
      uvs.push(0, i * 1.4, 1, i * 1.4);
      if (run > 0) {
        const a = positions.length / 3 - 4;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      run++;
    }
    if (indices.length === 0) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}
