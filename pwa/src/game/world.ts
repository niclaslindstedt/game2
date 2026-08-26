// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the 3D world for one stage: the road ribbon with its red/white
// edge strips and dirt skirts, the fords and the streams that feed them,
// the biome's forest and ground cover (flora.ts), boulders and bedrock
// outcrops, jump cones, and the start/finish gates. Everything is low-poly,
// vertex-colored, and Lambert-lit — the environment module's hemisphere +
// sun set the mood, the chunky speckle textures keep the arcade grain — and
// everything derives from the same compiled track samples the physics
// reads. The world is built in CHUNKS of road: a finite stage is one chunk
// built up front; an endless stage keeps building chunks ahead of the car
// and dropping them behind it.

import * as THREE from "three";
import { createRng, type GameState, type Track } from "@engine";

import { hash2, valueNoise } from "../lib/noise.ts";
import { biomeFor, type Biome, type Community, type FloraMix } from "./biome.ts";
import { buildFlora, type FloraPlacement } from "./flora.ts";
import { APRON, buildTerrain, LAKE_Y, type Terrain } from "./terrain.ts";
import { buildStreamMeshes, inStream } from "./streams.ts";
import { bannerTexture, gravelTexture, waterTexture } from "./textures.ts";

const UP = new THREE.Vector3(0, 1, 0);

/** Endless: unbuilt samples accumulate to this count before a chunk is cut
 * (2 m samples → 200 m of road), and chunks fully this far behind the car
 * are dropped. The engine's stream horizon minus the batch keeps the built
 * road comfortably past the fog ceiling. */
const CHUNK_SAMPLES = 100;
const PRUNE_BEHIND = 450;

function rightOf(heading: number): { x: number; z: number } {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

/** A chunk's samples for ribbon building: the range overlapped one sample
 * back so consecutive chunks weld, plus a straight dirt apron extrapolated
 * past the stage's ends — a rally car launches from dirt already laid
 * before the start gate, and a finite stage's flying finish has road to
 * run off onto. Only the drawn ribbon — the physics' samples are
 * untouched. */
function chunkSamples(track: Track, from: number, to: number): Track["samples"] {
  const base = track.samples.slice(Math.max(0, from - 1), to);
  const n = Math.round(APRON / track.step);
  if (from === 0) {
    const first = track.samples[0];
    const pre: Track["samples"] = [];
    for (let i = n; i >= 1; i--) {
      pre.push({
        ...first,
        x: first.x - Math.sin(first.heading) * track.step * i,
        z: first.z - Math.cos(first.heading) * track.step * i,
        s: first.s - track.step * i,
        surface: "gravel",
        jump: false,
      });
    }
    base.unshift(...pre);
  }
  if (!track.endless && to === track.samples.length) {
    const last = track.samples[track.samples.length - 1];
    for (let i = 1; i <= n; i++) {
      base.push({
        ...last,
        x: last.x + Math.sin(last.heading) * track.step * i,
        z: last.z + Math.cos(last.heading) * track.step * i,
        s: last.s + track.step * i,
        surface: "gravel",
        jump: false,
      });
    }
  }
  return base;
}

/** The road surface: a triangulated ribbon along the samples. */
function buildRoad(samples: Track["samples"], width: number): THREE.Mesh {
  const half = width / 2;
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
function buildSkirts(samples: Track["samples"], width: number): THREE.Mesh {
  const half = width / 2;
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

/** Red/white rumble strips along both edges, alternating every few meters.
 * Strips run the stage proper, never the aprons — pass the bare range. */
function buildRumble(samples: Track["samples"], width: number): THREE.Mesh {
  const half = width / 2;
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

/** Ford overlays: a wider translucent water sheet over each water run.
 * Only draws runs that COMPLETE before `to`; returns where the next call
 * should resume so a run straddling a chunk boundary is drawn whole by the
 * chunk that owns its end. */
function buildFords(
  track: Track,
  from: number,
  to: number,
  tex: THREE.Texture,
): { group: THREE.Group; next: number } {
  const group = new THREE.Group();
  const samples = track.samples;
  const half = track.width / 2 + 2.5;
  const flush = (a: number, b: number): void => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = a; i <= b; i++) {
      const s = samples[i];
      const r = rightOf(s.heading);
      const y = s.elevation + 0.09;
      positions.push(s.x - r.x * half, y, s.z - r.z * half, s.x + r.x * half, y, s.z + r.z * half);
      uvs.push(0, s.s / 4, 1, s.s / 4);
      if (i > a) {
        const q = (i - a - 1) * 2;
        indices.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
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
  let i = from;
  let next = from;
  while (i < to) {
    if (samples[i].surface !== "water") {
      i++;
      next = i;
      continue;
    }
    let j = i;
    while (j < samples.length && samples[j].surface === "water") j++;
    if (j >= to && to < samples.length) break; // straddles the frontier — defer
    flush(Math.max(0, i - 1), Math.min(j, samples.length - 1));
    i = j;
    next = i;
  }
  return { group, next };
}

/** Draw one flora variant id from a weighted mix. */
function pickFlora(mix: FloraMix, roll: number): string {
  let total = 0;
  for (const id in mix) total += mix[id];
  let t = roll * total;
  let last = "";
  for (const id in mix) {
    last = id;
    t -= mix[id];
    if (t <= 0) return id;
  }
  return last;
}

type SceneryChunk = {
  group: THREE.Group;
  update: (dt: number) => void;
  /** Zero out any prop the newly built road now runs through. */
  clearNear: (track: Track, from: number, to: number) => void;
};

/** The living landscape for one chunk of road: the biome's forest scattered
 * over the hills, a ground-cover band hugging the verge, loose boulders,
 * and bedrock outcrops shouldering out of the cut walls. Placement is
 * seeded by the track seed and chunk, validated against the road built so
 * far (aprons included) and the stream valleys, and everything stands on
 * the terrain height under it. On an endless run the road ahead is still
 * unwritten — `clearNear` retires props that later road claims. */
function buildScenery(
  track: Track,
  biome: Biome,
  terrain: Terrain,
  from: number,
  to: number,
  guard: Track["samples"],
): SceneryChunk {
  const group = new THREE.Group();
  const rng = createRng((track.seed ^ 0x5f356495 ^ Math.imul(from, 2246822519)) >>> 0);
  const samples = track.samples;
  const half = track.width / 2;
  const clearance = half + 3.5;
  const heightAt = terrain.heightAt;

  // Which plant community owns a patch of ground: a hash over grove-sized
  // cells (uniform, so the biome's weights hold exactly), the lookup
  // wobbled by noise so grove borders meander instead of running straight.
  const groveSeed = (track.seed ^ 0x9e3779b9) >>> 0;
  const totalWeight = biome.communities.reduce((sum, c) => sum + c.weight, 0);
  const communityAt = (x: number, z: number): Community => {
    const wx = x + (valueNoise(x, z, 47, groveSeed + 1) - 0.5) * 70;
    const wz = z + (valueNoise(z, x, 53, groveSeed + 2) - 0.5) * 70;
    let t = hash2(Math.floor(wx / biome.groveScale), Math.floor(wz / biome.groveScale), groveSeed);
    t *= totalWeight;
    for (const c of biome.communities) {
      t -= c.weight;
      if (t <= 0) return c;
    }
    return biome.communities[biome.communities.length - 1];
  };

  // Clearance checks walk the guard samples — the chunk's own road with
  // its aprons plus a margin of neighbours — so nothing grows on the road,
  // the start run-up, or the finish run-off.
  const clearOfRoad = (x: number, z: number, r: number): boolean => {
    for (let i = 0; i < guard.length; i += 4) {
      const dx = x - guard[i].x;
      const dz = z - guard[i].z;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  };

  const flora: FloraPlacement[] = [];

  // ── The forest: two bands, a treeline near the road and a spread
  // climbing the hills. WHAT grows at a spot is the community's call —
  // groves of a few species, meadows left open — with the shorelines and
  // the high bedrock overriding: willow and birch crowd the water, only
  // the tough survive up high.
  for (let i = Math.max(4, from); i < to; i += 2) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.chance(0.6) ? rng.range(clearance + 2, 46) : rng.range(46, 150);
    const jitter = rng.range(-3, 3);
    const x = s.x + r.x * offset * side + jitter;
    const z = s.z + r.z * offset * side + jitter;
    const roll = rng.next();
    const scale = rng.range(0.75, 1.35);
    const spin = rng.range(0, Math.PI * 2);
    if (!clearOfRoad(x, z, clearance)) continue;
    if (inStream(terrain.streams, x, z, 1.5)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    let mix: FloraMix;
    if (y < LAKE_Y + 4) mix = biome.lakeshoreTrees;
    else if (y > 26) mix = biome.highlandTrees;
    else {
      const community = communityAt(x, z);
      if (!rng.chance(community.density)) continue;
      mix = community.trees;
    }
    flora.push({ id: pickFlora(mix, roll), x, y, z, scale, spin });
  }

  // ── Ground cover: a dense strip just past the shoulder (what the car
  // actually sees at speed), and a sparser scatter under the treeline —
  // each clump drawn from its community's mix, so meadows fill with tall
  // grass and spruce woods with ferns.
  for (let i = Math.max(4, from); i < to; i += 2) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const band of [0, 1]) {
      const side = rng.chance(0.5) ? 1 : -1;
      const offset =
        band === 0 ? rng.range(half + 1.6, clearance + 5) : rng.range(clearance + 5, 34);
      const x = s.x + r.x * offset * side + rng.range(-2, 2);
      const z = s.z + r.z * offset * side + rng.range(-2, 2);
      const roll = rng.next();
      const scale = rng.range(0.7, 1.3);
      const spin = rng.range(0, Math.PI * 2);
      const community = communityAt(x, z);
      const chance = (biome.undergrowthDensity / 2) * (community.groundCover ?? 1);
      if (!rng.chance(chance)) continue;
      if (!clearOfRoad(x, z, half + 1.2)) continue;
      if (inStream(terrain.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      flora.push({
        id: pickFlora(community.undergrowth ?? biome.undergrowth, roll),
        x,
        y,
        z,
        scale,
        spin,
      });
    }
  }

  const planted = buildFlora(flora, () => rng.next());
  group.add(planted.group);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // ── Loose boulders on the open ground, greyed toward moss at random.
  type Rock = { x: number; y: number; z: number; s: number };
  const rocks: Rock[] = [];
  for (let i = Math.max(4, from); i < to; i += 7) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.range(clearance + 1, 120);
    const x = s.x + r.x * offset * side + rng.range(-3, 3);
    const z = s.z + r.z * offset * side + rng.range(-3, 3);
    const drop = rng.next();
    if (!clearOfRoad(x, z, clearance)) continue;
    if (inStream(terrain.streams, x, z, 0.5)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    rocks.push({ x, y, z, s: drop });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1);
  const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(biome.ground.bedrock) });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rocks.length));
  rockMesh.count = rocks.length;
  const tint = new THREE.Color();
  const mossy = new THREE.Color(0x87a05a);
  rocks.forEach((p, i) => {
    const scale = 0.5 + p.s * 1.6;
    q.setFromAxisAngle(UP, p.s * 20);
    m.compose(v.set(p.x, p.y + scale * 0.35, p.z), q, sc.set(scale, scale * 0.7, scale));
    rockMesh.setMatrixAt(i, m);
    // Every third boulder carries a mossy cast; the rest vary in grey.
    tint.setScalar(0.8 + p.s * 0.35);
    if (i % 3 === 0) tint.lerp(mossy, 0.5);
    rockMesh.setColorAt(i, tint);
  });
  group.add(rockMesh);

  // ── Bedrock outcrops: where the embankment climbs hard beside the road
  // (the cut between two walls of high ground), big angular slabs push out
  // of the slope right at the shoulder, doubling the terrain's rock paint.
  type Slab = { x: number; y: number; z: number; s: number; spin: number };
  const slabs: Slab[] = [];
  for (let i = Math.max(6, from); i < to; i += 5) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      const wall = heightAt(s.x + r.x * 16 * side, s.z + r.z * 16 * side) - s.elevation;
      if (wall < 6 || !rng.chance(0.55)) continue;
      const offset = rng.range(half + 2.5, half + 8);
      const x = s.x + r.x * offset * side + rng.range(-1.5, 1.5);
      const z = s.z + r.z * offset * side + rng.range(-1.5, 1.5);
      slabs.push({
        x,
        y: heightAt(x, z),
        z,
        s: rng.range(1.6, 3.4 + Math.min(wall, 14) * 0.12),
        spin: rng.range(0, Math.PI * 2),
      });
    }
  }
  const slabGeo = new THREE.DodecahedronGeometry(1);
  const slabMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(biome.ground.bedrockDark),
  });
  const slabMesh = new THREE.InstancedMesh(slabGeo, slabMat, Math.max(1, slabs.length));
  slabMesh.count = slabs.length;
  slabs.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.spin);
    // Sunk a third in, stretched tall — a face of rock, not a pebble.
    m.compose(v.set(p.x, p.y + p.s * 0.5, p.z), q, sc.set(p.s, p.s * 1.3, p.s * 0.8));
    slabMesh.setMatrixAt(i, m);
    slabMesh.setColorAt(i, tint.setScalar(0.85 + ((i * 37) % 10) * 0.03));
  });
  group.add(slabMesh);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const clearNear = (t: Track, nFrom: number, nTo: number): void => {
    const reach = (clearance + 2) * (clearance + 2);
    const hits = (x: number, z: number): boolean => {
      for (let i = nFrom; i < nTo; i += 2) {
        const dx = x - t.samples[i].x;
        const dz = z - t.samples[i].z;
        if (dx * dx + dz * dz < reach) return true;
      }
      return false;
    };
    planted.retire(hits);
    let touched = false;
    rocks.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      rockMesh.setMatrixAt(i, zero);
      touched = true;
    });
    slabs.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      slabMesh.setMatrixAt(i, zero);
      touched = true;
    });
    if (touched) {
      rockMesh.instanceMatrix.needsUpdate = true;
      slabMesh.instanceMatrix.needsUpdate = true;
    }
  };

  return { group, update: planted.update, clearNear };
}

/** Warning cones flanking each jump lip in the range. */
function buildCones(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const half = track.width / 2;
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 6);
  const coneMat = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  for (let i = from; i < to; i++) {
    const s = track.samples[i];
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
  return group;
}

/** A rally gate over the road at a sample, after the real thing: red/white
 * candy-striped legs, a white banner with its word on the face the
 * approaching car reads, and hay bales lining the road below. */
function buildGate(track: Track, index: number, label: "start" | "finish"): THREE.Group {
  const group = new THREE.Group();
  const half = track.width / 2;
  const s = track.samples[index];
  const r = rightOf(s.heading);
  const red = new THREE.MeshLambertMaterial({ color: "#e23c2c" });
  const white = new THREE.MeshLambertMaterial({ color: "#f6f3ea" });
  const stripeGeo = new THREE.BoxGeometry(0.45, 1, 0.45);
  const baleGeo = new THREE.BoxGeometry(1.5, 0.75, 0.85);
  const baleMat = new THREE.MeshLambertMaterial({ color: "#d9b45c" });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Mesh(stripeGeo, k % 2 === 0 ? red : white);
      seg.position.set(
        s.x + r.x * (half + 1) * side,
        s.elevation + k + 0.5,
        s.z + r.z * (half + 1) * side,
      );
      seg.rotation.y = s.heading;
      group.add(seg);
    }
    // A short wall of bales each side: three along the road, one on top.
    for (let k = 0; k < 4; k++) {
      const along =
        track.samples[Math.max(0, Math.min(track.samples.length - 1, index + (k - 1) * 2))];
      const bale = new THREE.Mesh(baleGeo, baleMat);
      const lat = (half + 1.9) * side;
      const top = k === 3;
      const b = top ? track.samples[index] : along;
      bale.position.set(
        b.x + rightOf(b.heading).x * lat,
        b.elevation + (top ? 1.12 : 0.38),
        b.z + rightOf(b.heading).z * lat,
      );
      bale.rotation.y = b.heading + Math.PI / 2 + (k - 1.5) * 0.07;
      group.add(bale);
    }
  }
  const text = new THREE.MeshLambertMaterial({
    color: "#ffffff",
    map: bannerTexture(label.toUpperCase()),
  });
  // BoxGeometry face order is +x,-x,+y,-y,+z,-z; with rotation.y set to
  // the heading, -z is the face looking back down the road at the car.
  const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 2, 1.3, 0.3), [
    white,
    white,
    white,
    white,
    white,
    text,
  ]);
  banner.position.set(s.x, s.elevation + 4.7, s.z);
  banner.rotation.y = s.heading;
  banner.name = label;
  group.add(banner);
  return group;
}

export type World = {
  group: THREE.Group;
  update: (dt: number) => void;
  /** Endless: catch the world up with the streamed track and the car —
   * build the road chunks that now exist, drop the ones left behind. */
  sync: (state: GameState) => void;
  dispose: () => void;
};

function disposeGroup(group: THREE.Group): void {
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
}

export function buildWorld(track: Track): World {
  const group = new THREE.Group();
  const biome = biomeFor();
  const waterTex = waterTexture();
  const terrain = buildTerrain(track, biome, waterTex);
  group.add(terrain.group);
  terrain.sync(track, 0);

  type Chunk = { toS: number; group: THREE.Group; scenery: SceneryChunk };
  const chunks: Chunk[] = [];
  let builtIndex = 0;
  let fordScan = 0;
  let streamScanS = 0;

  const buildChunk = (from: number, to: number): void => {
    const chunkGroup = new THREE.Group();
    const ribbon = chunkSamples(track, from, to);
    chunkGroup.add(buildSkirts(ribbon, track.width));
    chunkGroup.add(buildRoad(ribbon, track.width));
    chunkGroup.add(buildRumble(track.samples.slice(Math.max(0, from - 1), to), track.width));
    const fords = buildFords(track, fordScan, to, waterTex);
    fordScan = fords.next;
    chunkGroup.add(fords.group);
    const toS = track.samples[to - 1].s;
    const fresh = terrain.streams.filter((s) => s.centerS >= streamScanS && s.centerS < toS);
    if (fresh.length > 0) chunkGroup.add(buildStreamMeshes(fresh, waterTex));
    streamScanS = toS;
    // The clearance guard: this chunk's aproned ribbon plus a margin of
    // neighbouring road, so props keep off the seams too.
    const guard = [
      ...ribbon,
      ...track.samples.slice(Math.max(0, from - 120), Math.max(0, from - 1)),
      ...track.samples.slice(to, Math.min(track.samples.length, to + 120)),
    ];
    const scenery = buildScenery(track, biome, terrain, from, to, guard);
    chunkGroup.add(scenery.group);
    chunkGroup.add(buildCones(track, from, to));
    if (from === 0) chunkGroup.add(buildGate(track, 2, "start"));
    if (!track.endless && to === track.samples.length) {
      chunkGroup.add(buildGate(track, to - 2, "finish"));
    }
    group.add(chunkGroup);
    chunks.push({ toS, group: chunkGroup, scenery });
  };

  buildChunk(0, track.samples.length);
  builtIndex = track.samples.length;

  const sync = (state: GameState): void => {
    if (!track.endless) return;
    terrain.sync(track, state.progressS);
    const len = track.samples.length;
    if (len - builtIndex >= CHUNK_SAMPLES) {
      const from = builtIndex;
      buildChunk(from, len);
      builtIndex = len;
      // Road that has just come into being may run through props planted
      // when it did not exist yet — retire them before anyone sees it.
      for (const chunk of chunks) chunk.scenery.clearNear(track, from, len);
    }
    while (chunks.length > 1 && chunks[0].toS < state.progressS - PRUNE_BEHIND) {
      const old = chunks.shift() as Chunk;
      group.remove(old.group);
      disposeGroup(old.group);
    }
  };

  const update = (dt: number): void => {
    terrain.update(dt);
    for (const chunk of chunks) chunk.scenery.update(dt);
  };

  const dispose = (): void => {
    disposeGroup(group);
    terrain.dispose();
  };

  return { group, update, sync, dispose };
}
