// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The streams' water surfaces. The stream GEOMETRY — where each watercourse
// runs, how its valley is carved, what stands clear of it — lives in the
// engine's terrain field (the car can drive into a stream, so the physics
// owns it); this module only draws the ribbons over the polylines the
// field computed.

import * as THREE from "three";
import type { Stream } from "@engine";

export type { Stream };

/** The water surfaces: one ribbon per stream, tapering toward both ends,
 * lifted a hair above the carved bed. Shares the ford sheets' material
 * look (Phong — the sun glitters on it). */
export function buildStreamMeshes(streams: Stream[], texture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  for (const s of streams) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const n = s.points.length;
    for (let i = 0; i < n; i++) {
      const p = s.points[i];
      const q = s.points[Math.min(n - 1, i + 1)];
      const o = s.points[Math.max(0, i - 1)];
      let dx = q.x - o.x;
      let dz = q.z - o.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // Taper: full width at the road, narrowing to a trickle at the ends.
      const end = Math.min(i, n - 1 - i) / (n / 3);
      const w = s.halfWidth * (0.45 + 0.55 * Math.min(1, end));
      positions.push(
        p.x - dz * w,
        p.y + 0.07,
        p.z + dx * w,
        p.x + dz * w,
        p.y + 0.07,
        p.z - dx * w,
      );
      uvs.push(0, i * 1.4, 1, i * 1.4);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({
      map: texture,
      specular: 0xcfe4ff,
      shininess: 120,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}
