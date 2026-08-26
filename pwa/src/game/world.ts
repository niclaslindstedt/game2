// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the 3D world for one stage: the road ribbon with its red/white
// edge strips and dirt skirts, the fords, the tree line, rocks, jump cones,
// and the start/finish gates. Everything is low-poly, vertex-colored, and
// Lambert-lit — the environment module's hemisphere + sun set the mood, the
// chunky speckle textures keep the arcade grain — and everything derives
// from the same compiled track samples the physics reads.

import * as THREE from "three";
import { createRng, type Track } from "@engine";

import { buildTerrain, LAKE_Y } from "./terrain.ts";
import { foliageTexture, gravelTexture, waterTexture } from "./textures.ts";

const UP = new THREE.Vector3(0, 1, 0);

function rightOf(heading: number): { x: number; z: number } {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

/** The road surface: a triangulated ribbon along the samples. */
function buildRoad(track: Track): THREE.Mesh {
  const samples = track.samples;
  const half = track.width / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const dry = new THREE.Color("#ffffff");
  const wet = new THREE.Color("#9db4d8");

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const y = s.elevation + 0.02;
    positions.push(s.x - r.x * half, y, s.z - r.z * half, s.x + r.x * half, y, s.z + r.z * half);
    const v = s.s / 6;
    uvs.push(0, v, 1.8, v);
    const tint = s.surface === "water" ? wet : dry;
    colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
    if (i > 0) {
      // Wound so the face normals point up — the road is drawn single-sided
      // and a downward winding would cull the whole surface from above.
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: gravelTexture(), vertexColors: true });
  return new THREE.Mesh(geo, mat);
}

/** Dirt skirts: close the gap between a raised road (ramps, crests) and the
 * ground so lips read as solid landforms, not floating carpet. */
function buildSkirts(track: Track): THREE.Mesh {
  const samples = track.samples;
  const half = track.width / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const r = rightOf(s.heading);
      const ex = s.x + r.x * half * side;
      const ez = s.z + r.z * half * side;
      // The skirt drops a few meters below grade — deep enough to meet the
      // terrain shelf under every roll of the road.
      positions.push(ex, s.elevation + 0.02, ez, ex, s.elevation - 5, ez);
      if (i > 0) {
        const a = start + (i - 1) * 2;
        if (side > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: "#8a6f4d", side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** Red/white rumble strips along both edges, alternating every few meters. */
function buildRumble(track: Track): THREE.Mesh {
  const samples = track.samples;
  const half = track.width / 2;
  const stripW = 0.9;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const red = new THREE.Color("#e23c2c");
  const white = new THREE.Color("#f6f3ea");

  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const r = rightOf(s.heading);
      const y = s.elevation + 0.03;
      const inner = half * side;
      const outer = (half + stripW) * side;
      positions.push(
        s.x + r.x * inner,
        y,
        s.z + r.z * inner,
        s.x + r.x * outer,
        y,
        s.z + r.z * outer,
      );
      const c = Math.floor(s.s / 4) % 2 === 0 ? red : white;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i > 0) {
        const a = start + (i - 1) * 2;
        if (side > 0) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** Ford overlays: a wider translucent water sheet over each water run. */
function buildWater(track: Track): THREE.Group {
  const group = new THREE.Group();
  const samples = track.samples;
  const half = track.width / 2 + 2.5;
  const tex = waterTexture();
  let runStart = -1;
  const flush = (from: number, to: number): void => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = from; i <= to; i++) {
      const s = samples[i];
      const r = rightOf(s.heading);
      const y = s.elevation + 0.09;
      positions.push(s.x - r.x * half, y, s.z - r.z * half, s.x + r.x * half, y, s.z + r.z * half);
      uvs.push(0, s.s / 4, 1, s.s / 4);
      if (i > from) {
        const a = (i - from - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // Phong, like the lakes: the ford glitters when the sun catches it.
    const mat = new THREE.MeshPhongMaterial({
      map: tex,
      specular: 0xcfe4ff,
      shininess: 120,
      transparent: true,
      opacity: 0.85,
    });
    group.add(new THREE.Mesh(geo, mat));
  };
  for (let i = 0; i < samples.length; i++) {
    const isWater = samples[i].surface === "water";
    if (isWater && runStart < 0) runStart = Math.max(0, i - 1);
    if (!isWater && runStart >= 0) {
      flush(runStart, i);
      runStart = -1;
    }
  }
  if (runStart >= 0) flush(runStart, samples.length - 1);
  return group;
}

/** Very rough trees and rocks scattered over the landscape, instanced.
 * Placement is seeded by the track seed, validated to stay off every road
 * sample, and every trunk stands on the terrain height under it — up the
 * hillsides, never in a lake. */
function buildScenery(track: Track, heightAt: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group();
  const rng = createRng((track.seed ^ 0x5f356495) >>> 0);
  const samples = track.samples;
  const clearance = track.width / 2 + 3.5;

  const clearOfRoad = (x: number, z: number): boolean => {
    for (let i = 0; i < samples.length; i += 4) {
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      if (dx * dx + dz * dz < clearance * clearance) return false;
    }
    return true;
  };

  type Spot = { x: number; z: number; y: number; s: number };
  const spots: Spot[] = [];
  for (let i = 4; i < samples.length; i += 3) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    // Two bands: a treeline hugging the road, and a spread climbing the
    // hills — the landscape reads inhabited all the way out.
    const offset = rng.chance(0.6) ? rng.range(clearance + 2, 46) : rng.range(46, 150);
    const jitter = rng.range(-3, 3);
    const x = s.x + r.x * offset * side + jitter;
    const z = s.z + r.z * offset * side + jitter;
    const drop = rng.next();
    if (!clearOfRoad(x, z)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    spots.push({ x, z, y, s: drop });
  }

  const treeSpots = spots.filter((p) => p.s < 0.82);
  const rockSpots = spots.filter((p) => p.s >= 0.82);

  // Trees: a chunky trunk box and two stacked foliage cones. Deliberately
  // crude — five-sided cones, nearest-filtered speckle, big scale spread.
  const foliage = new THREE.MeshLambertMaterial({ map: foliageTexture() });
  const trunkMat = new THREE.MeshLambertMaterial({ color: "#7a4f2a" });
  const cone = new THREE.ConeGeometry(1.6, 3.2, 5);
  const trunk = new THREE.BoxGeometry(0.5, 1.6, 0.5);
  const coneMesh = new THREE.InstancedMesh(cone, foliage, treeSpots.length * 2);
  const trunkMesh = new THREE.InstancedMesh(trunk, trunkMat, treeSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  treeSpots.forEach((p, i) => {
    const scale = 0.8 + (p.s / 0.82) * 1.4;
    const spin = p.s * 6.28;
    q.setFromAxisAngle(UP, spin);
    m.compose(v.set(p.x, p.y + 0.8 * scale, p.z), q, sc.set(scale, scale, scale));
    trunkMesh.setMatrixAt(i, m);
    m.compose(v.set(p.x, p.y + (1.6 + 1.4) * scale, p.z), q, sc.set(scale, scale, scale));
    coneMesh.setMatrixAt(i * 2, m);
    m.compose(
      v.set(p.x, p.y + (1.6 + 2.9) * scale, p.z),
      q,
      sc.set(scale * 0.7, scale * 0.8, scale * 0.7),
    );
    coneMesh.setMatrixAt(i * 2 + 1, m);
  });
  group.add(trunkMesh, coneMesh);

  const rockGeo = new THREE.DodecahedronGeometry(1);
  const rockMat = new THREE.MeshLambertMaterial({ color: "#9aa0a8" });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
  rockSpots.forEach((p, i) => {
    const scale = 0.5 + (p.s - 0.82) * 6;
    q.setFromAxisAngle(UP, p.s * 20);
    m.compose(v.set(p.x, p.y + scale * 0.4, p.z), q, sc.set(scale, scale * 0.7, scale));
    rocks.setMatrixAt(i, m);
  });
  group.add(rocks);
  return group;
}

/** Warning cones flanking each jump lip, and start/finish gates. */
function buildMarkers(track: Track): THREE.Group {
  const group = new THREE.Group();
  const half = track.width / 2;
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 6);
  const coneMat = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  for (const s of track.samples) {
    if (!s.jump) continue;
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(
        s.x + r.x * (half + 0.8) * side,
        s.elevation + 0.55,
        s.z + r.z * (half + 0.8) * side,
      );
      group.add(cone);
    }
  }

  const gate = (index: number, color: string, label: "start" | "finish"): void => {
    const s = track.samples[index];
    const r = rightOf(s.heading);
    const postGeo = new THREE.BoxGeometry(0.4, 5, 0.4);
    const postMat = new THREE.MeshLambertMaterial({ color: "#f6f3ea" });
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(track.width + 2, 1.1, 0.25),
      new THREE.MeshLambertMaterial({ color }),
    );
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        s.x + r.x * (half + 1) * side,
        s.elevation + 2.5,
        s.z + r.z * (half + 1) * side,
      );
      group.add(post);
    }
    banner.position.set(s.x, s.elevation + 4.6, s.z);
    banner.rotation.y = s.heading;
    banner.name = label;
    group.add(banner);
  };
  gate(2, "#28a84c", "start");
  gate(track.samples.length - 2, "#123069", "finish");
  return group;
}

export type World = { group: THREE.Group; update: (dt: number) => void; dispose: () => void };

export function buildWorld(track: Track): World {
  const group = new THREE.Group();

  const terrain = buildTerrain(track, waterTexture());
  group.add(terrain.group);
  group.add(buildSkirts(track));
  group.add(buildRoad(track));
  group.add(buildRumble(track));
  group.add(buildWater(track));
  group.add(buildScenery(track, terrain.heightAt));
  group.add(buildMarkers(track));

  const update = (dt: number): void => terrain.update(dt);

  const dispose = (): void => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) {
            mat.map?.dispose();
          }
          mat.dispose();
        }
      }
    });
  };
  return { group, update, dispose };
}
