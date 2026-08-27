// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R26 — THE RED AND WHITE, as objects in the world.
//
// The engine decides WHERE (engine/mapgen/kerbs.ts owns the placement guide
// and hands back a list of zones); this module decides what stands there,
// and the answer depends entirely on what the road is made of:
//
//   ASPHALT gets a kerb. A low, continuous concrete edging laid along the
//   road, striped along its length — the thing a car can put two wheels on
//   and feel. It runs through the whole zone, because that is how a kerb is
//   laid.
//
//   GRAVEL gets POSTS. A poured concrete kerb down the side of a forest road
//   is a lie; what a rally actually puts out there is a line of red-and-white
//   marker posts hammered into the verge, and at the places where cutting is
//   the temptation, a row of anti-cut blocks. They are DISCRETE — a run of
//   objects with country between them, which is the whole visual difference
//   from a painted band and the reason a gravel stage reads as a road with a
//   rally on it rather than as a circuit.
//
// Everything here is instanced: a stage's worth of posts is hundreds of
// identical little objects, and hundreds of draw calls for them is the
// cheapest possible way to lose a frame budget.

import * as THREE from "three";
import { STAGE_RULES, buildKerbs, corridorOffset, type KerbZone, type Track } from "@engine";

import type { Ribbon } from "./ribbon.ts";
import { rightOf } from "./ribbon.ts";

/** The rally's two colours, everywhere they appear. */
const RED = "#e23c2c";
const WHITE = "#f6f3ea";

/** A marker post: a slim square stake standing in the verge, red with a
 * white band round its middle. Real ones are plastic or timber about a
 * metre out of the ground — tall enough to read over a crest, light enough
 * that hitting one costs nothing but the post. */
const POST = { width: 0.16, height: 1.05, out: 0.75 };

/** An anti-cut block: a low, wide wedge of concrete laid ON the inside of a
 * corner. Unlike a post it is meant to be felt — the car that cuts the apex
 * gets thrown, which is the point of it. */
const BLOCK = { width: 1.5, height: 0.28, depth: 0.6, out: 0.55 };

/** The asphalt kerb: how far out from the road edge it starts, how wide it
 * is, and how proud of the mat it stands. Low profile on purpose — this is
 * a country road's edging, not a circuit's sawtooth. */
const KERB = { width: 0.62, lift: 0.07 };
/** ...and how long one stripe of it runs, meters. */
const STRIPE = 1.6;

/** How far apart the anti-cut blocks in an apex run sit, meters. */
const BLOCK_SPACING = 3.4;

/** ...and how far apart the posts do. Read off the engine's own rule, so
 * the placement guide and the objects that realize it cannot drift. */
const POST_SPACING = STAGE_RULES.kerb.postSpacing;

/** Is arc position `s` inside one of the zones on `side`? Returns the role
 * that put it there, or null. */
function roleAt(zones: KerbZone[], s: number, side: -1 | 1): KerbZone["role"] | null {
  for (const zone of zones) {
    if (zone.side !== side) continue;
    if (s < zone.fromS) continue;
    if (s > zone.toS) continue;
    return zone.role;
  }
  return null;
}

/** One instanced batch of an identical little object, filled as it is
 * placed. Placements are collected first and the mesh built once at the
 * end, because an InstancedMesh has to be told how many it holds. */
type Placement = { x: number; y: number; z: number; spin: number };

function instance(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  spots: Placement[],
): THREE.InstancedMesh | null {
  if (spots.length === 0) {
    geo.dispose();
    return null;
  }
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.spin);
    m.compose(v.set(p.x, p.y, p.z), q, one);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

/**
 * Every piece of red and white this stretch of road wears.
 *
 * `samples` is the bare stage range (never the drawn apron — a marker post
 * standing on extrapolated road past the finish belongs to nothing), and
 * `width` the road's full width.
 */
export function buildKerbing(track: Track, samples: Ribbon[], width: number): THREE.Group {
  const group = new THREE.Group();
  if (samples.length === 0) return group;
  const zones = buildKerbs(track, samples[0].s, samples[samples.length - 1].s);
  if (zones.length === 0) return group;

  const half = width / 2;
  const posts: Placement[] = [];
  const blocks: Placement[] = [];
  /** The asphalt kerb, built as a strip per side: [inner, outer] vertex
   * pairs, broken wherever the zone stops. */
  const strip = { positions: [] as number[], colors: [] as number[], indices: [] as number[] };
  const red = new THREE.Color(RED);
  const white = new THREE.Color(WHITE);

  for (const side of [-1, 1] as const) {
    let start = strip.positions.length / 3;
    let run = 0;
    /** Arc position the last discrete marker went down at, so posts space
     * themselves along the road rather than landing on every sample. */
    let lastPost = -Infinity;
    let lastBlock = -Infinity;
    for (const s of samples) {
      const role = roleAt(zones, s.s, side);
      const sealed = s.surface === "asphalt";
      // A ford and a bridge deck carry no edging of their own: the water
      // and the parapet are the markers there.
      if (role === null || s.surface === "water" || s.deck != null) {
        start = strip.positions.length / 3;
        run = 0;
        continue;
      }
      const r = rightOf(s.heading);
      if (sealed) {
        // The continuous kerb. Its two edges ride the corridor's own
        // profile, so a kerb on a banked corner is banked with the road.
        const inner = (half - KERB.width) * side;
        const outer = half * side;
        const yIn = s.elevation + corridorOffset(s, inner, width) + KERB.lift;
        const yOut = s.elevation + corridorOffset(s, outer, width) + KERB.lift;
        strip.positions.push(
          s.x + r.x * inner,
          yIn,
          s.z + r.z * inner,
          s.x + r.x * outer,
          yOut,
          s.z + r.z * outer,
        );
        const tint = Math.floor(s.s / STRIPE) % 2 === 0 ? red : white;
        strip.colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
        if (run > 0) {
          const a = start + (run - 1) * 2;
          if (side > 0) strip.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          else strip.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        run += 1;
        continue;
      }
      // Gravel. The strip has to break here or the next sealed run would
      // weld itself onto whatever the last one was doing.
      start = strip.positions.length / 3;
      run = 0;
      // Anti-cut blocks are laid at an apex, where cutting is the whole
      // temptation; everything else is marked with posts.
      if (role === "apex" && s.s - lastBlock >= BLOCK_SPACING) {
        lastBlock = s.s;
        const out = half + BLOCK.out;
        blocks.push({
          x: s.x + r.x * out * side,
          y: s.elevation + corridorOffset(s, out * side, width) + BLOCK.height / 2,
          z: s.z + r.z * out * side,
          spin: s.heading,
        });
        continue;
      }
      if (s.s - lastPost < POST_SPACING) continue;
      lastPost = s.s;
      const out = half + POST.out;
      posts.push({
        x: s.x + r.x * out * side,
        y: s.elevation + corridorOffset(s, out * side, width) + POST.height / 2,
        z: s.z + r.z * out * side,
        spin: s.heading,
      });
    }
  }

  if (strip.indices.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(strip.positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(strip.colors, 3));
    geo.setIndex(strip.indices);
    geo.computeVertexNormals();
    group.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      ),
    );
  }

  const postMesh = instance(postGeometry(), postMaterials(), posts);
  if (postMesh) group.add(postMesh);
  const blockMesh = instance(
    new THREE.BoxGeometry(BLOCK.width, BLOCK.height, BLOCK.depth),
    blockMaterials(),
    blocks,
  );
  if (blockMesh) group.add(blockMesh);
  return group;
}

/** A post: a plain square stake. The white band is a face split rather than
 * a texture — one more box would double the instance count for a stripe
 * nobody reads past twenty metres. */
function postGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(POST.width, POST.height, POST.width);
}

/** Red sides, white top: the top is what a driver sees of a post from a car,
 * and it is the only face worth a second colour. */
function postMaterials(): THREE.Material[] {
  const red = new THREE.MeshLambertMaterial({ color: RED });
  const white = new THREE.MeshLambertMaterial({ color: WHITE });
  return [red, red, white, red, red, red];
}

/** A block is the other way round — white body, red ends — because it is
 * seen from along the road rather than from above it. */
function blockMaterials(): THREE.Material[] {
  const red = new THREE.MeshLambertMaterial({ color: RED });
  const white = new THREE.MeshLambertMaterial({ color: WHITE });
  return [red, red, white, white, white, white];
}
