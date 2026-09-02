// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RAILWAY, drawn (R41). The engine cut the line's two arms from the
// railway it laid across the country (`track.spurs`, flagged `rail`) and
// recorded where the rally goes over it (`track.rails`); this module builds
// what stands on that: the ballast bed on the shelf the terrain flattened
// under the arm, the sleepers in it, the two rails on them, and — at the
// crossing — the planked deck the road runs over the rails on and the
// crossed boards either side that say a train may come. The train itself is
// `train.ts`.
//
// Nothing here is solid. The train is a run of solids the engine stands on
// the rails each step; the line is a road to the physics (ballast grip),
// and the deck is drawn flush enough with the road that a car at speed
// never notices the sixteen centimetres of rail head it passes through.
//
// The rails ride the arm's own samples: their base is the sample's
// elevation, so at the crossing point — where the arm was cut at the
// route's own height — the rail head stands a rail's height over the road,
// exactly as a level crossing's does.

import * as THREE from "three";
import type { RailCrossing, Spur, SpurSample, Track } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { rightOf } from "./ribbon.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";
import { box } from "./house.ts";

/** The permanent way, m. Standard gauge, on concrete sleepers at the
 * spacing a Swedish branch line lays them, in a ballast bed whose top is a
 * sleeper's width either side of the ends and whose shoulders run down to
 * the formation the terrain shelves. */
export const RAIL = {
  gauge: 1.435,
  rail: { width: 0.07, height: 0.16, head: 0.075 },
  sleeper: { length: 2.5, width: 0.24, height: 0.14, pitch: 0.65 },
  ballast: { top: 3.8, bottom: 6.0, depth: 0.42 },
  /** The crossing deck: how far it reaches either side of the rails
   * across the line, and past the road's edges along it. */
  deck: { across: 0.8, past: 0.6 },
  /** The crossed board (a "kryssmärke"): its post, and the arms of the X. */
  sign: { post: 2.6, arm: 1.1, width: 0.22, rim: 0.05, setBack: 4, out: 1.4 },
} as const;

const TINT = {
  ballast: new THREE.Color(0x7d7267),
  ballastDark: new THREE.Color(0x66584d),
  sleeper: new THREE.Color(0x8e8a80),
  railSide: new THREE.Color(0x5a4a3f),
  railHead: new THREE.Color(0x9a9a98),
  deck: new THREE.Color(0x4c4038),
  deckEdge: new THREE.Color(0x7a6b5a),
  post: new THREE.Color(0x8c8c88),
  cross: new THREE.Color(0xf1ede2),
  rim: new THREE.Color(0xc4261d),
};

const railMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** The rails, ballast and crossing furniture all share the buildings'
 * speckled Lambert; the sleepers are instanced under a flat one. */
const sleeperMaterial = shareOne(() => new THREE.MeshLambertMaterial({ color: TINT.sleeper }));

/** A strip swept along the samples: a cross-section of (lateral, height)
 * pairs at every sample, stitched into a closed ribbon. Vertex-coloured by
 * the pair's index so the head of a rail can be lighter than its web. */
function sweep(
  samples: readonly SpurSample[],
  section: { u: number; y: number; color: THREE.Color }[],
  lift: number,
): THREE.BufferGeometry {
  const n = section.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const r = rightOf(p.heading);
    for (const { u, y, color } of section) {
      positions.push(p.x + r.x * u, p.elevation + lift + y, p.z + r.z * u);
      colors.push(color.r, color.g, color.b);
    }
    if (i === 0) continue;
    const a = (i - 1) * n;
    const b = i * n;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      indices.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** One arm of the line, from the crossing out to the edge of the map. */
export function buildRailArm(spur: Spur): THREE.Group {
  const group = new THREE.Group();
  const { samples } = spur;
  if (samples.length < 2) return group;
  const B = RAIL.ballast;
  // The ballast bed: a trapezoid whose top carries the sleepers and whose
  // shoulders run down into the shelf. A hair above the shelf on top so the
  // ground never wins the depth test through it.
  const ballast = sweep(
    samples,
    [
      { u: -B.bottom / 2, y: -B.depth, color: TINT.ballastDark },
      { u: -B.top / 2, y: 0.02, color: TINT.ballast },
      { u: B.top / 2, y: 0.02, color: TINT.ballast },
      { u: B.bottom / 2, y: -B.depth, color: TINT.ballastDark },
    ],
    0,
  );
  group.add(new THREE.Mesh(ballast, railMaterial()));
  // The two rails: an I of sorts — a foot, a web and a lighter head.
  const R = RAIL.rail;
  for (const side of [-1, 1]) {
    const c = (side * RAIL.gauge) / 2;
    const w = R.width / 2;
    const rail = sweep(
      samples,
      [
        { u: c - w * 1.6, y: 0, color: TINT.railSide },
        { u: c - w, y: R.height - R.head, color: TINT.railSide },
        { u: c - w, y: R.height, color: TINT.railHead },
        { u: c + w, y: R.height, color: TINT.railHead },
        { u: c + w, y: R.height - R.head, color: TINT.railSide },
        { u: c + w * 1.6, y: 0, color: TINT.railSide },
      ],
      RAIL.sleeper.height * 0.5,
    );
    group.add(new THREE.Mesh(rail, railMaterial()));
  }
  // The sleepers, one instance every `pitch` metres of arc, sunk to half
  // their height in the ballast the way a bed is tamped up to them.
  const S = RAIL.sleeper;
  const last = samples[samples.length - 1].s;
  const count = Math.max(1, Math.floor(last / S.pitch));
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(S.length, S.height, S.width),
    sleeperMaterial(),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (let n = 0; n < count; n++) {
    const s = n * S.pitch;
    while (k + 1 < samples.length - 1 && samples[k + 1].s <= s) k++;
    const a = samples[k];
    const b = samples[Math.min(k + 1, samples.length - 1)];
    const run = b.s - a.s;
    const t = run > 1e-6 ? (s - a.s) / run : 0;
    pos.set(
      a.x + (b.x - a.x) * t,
      a.elevation + (b.elevation - a.elevation) * t,
      a.z + (b.z - a.z) * t,
    );
    q.setFromAxisAngle(up, a.heading);
    m.compose(pos, q, one);
    sleepers.setMatrixAt(n, m);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  // The line runs to the edge of the map, well past the fog: culling by the
  // sphere of a 3 km mesh is culling nothing, and the cost is one call.
  sleepers.frustumCulled = false;
  group.add(sleepers);
  return group;
}

/** Nearest route sample index to an arc position, by bisection. */
function indexAtS(track: Track, s: number): number {
  const { samples } = track;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The crossing's furniture: the deck the road runs over the rails on, and
 * the crossed boards on either approach. Built once per crossing, with the
 * arm that leaves it. */
export function buildRailCrossing(
  track: Track,
  crossing: RailCrossing,
  rand: () => number,
): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder(rand);
  const at = track.samples[indexAtS(track, crossing.s)];
  const roadWidth = at?.width ?? track.width;
  // The deck lies ALONG the rails (its long side is the road's width) and
  // reaches `across` past each rail: planks up to the rail head, so the
  // road climbs the sixteen centimetres onto the rails and off again.
  const D = RAIL.deck;
  const along = roadWidth + D.past * 2;
  const across = RAIL.gauge + RAIL.rail.width + D.across * 2;
  const top = RAIL.sleeper.height * 0.5 + RAIL.rail.height;
  // Built in the RAILWAY's frame: +z along the rails.
  const inRail = { ry: crossing.heading, x: crossing.x, z: crossing.z };
  const placeBox = (
    color: THREE.Color,
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
  ): void => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(cx, cy, cz);
    b.add(geo, color, inRail);
  };
  // Three planked panels: between the rails, and outside each — the gaps
  // beside the rail heads are left for the flanges.
  const gapU = RAIL.gauge / 2 + RAIL.rail.width / 2 + 0.05;
  const inner = RAIL.gauge - RAIL.rail.width - 0.1;
  placeBox(TINT.deck, 0, top / 2, 0, inner, top, along);
  for (const side of [-1, 1]) {
    const u = side * (gapU + (across / 2 - gapU) / 2);
    placeBox(TINT.deck, u, top / 2, 0, across / 2 - gapU, top, along);
  }
  // A pale edge board along both ends of the deck, where it meets the road.
  for (const end of [-1, 1]) {
    placeBox(TINT.deckEdge, 0, top / 2, end * (along / 2 - 0.08), across, top + 0.01, 0.16);
  }
  // The crossed boards: one on the driver's right on each approach, set
  // back from the rails and standing out past the road's edge, its X
  // facing the car. The road is square to the rails, so its direction is
  // the rails' turned a quarter, and which quarter is the route's own
  // heading here.
  const roadHeading = at ? at.heading : crossing.heading + Math.PI / 2;
  const G = RAIL.sign;
  for (const approach of [-1, 1]) {
    const fwd = { x: Math.sin(roadHeading) * approach, z: Math.cos(roadHeading) * approach };
    const r = rightOf(roadHeading);
    // The sign stands before the rails as the car comes at them, on ITS
    // right — so on the far approach it is on the far side's own right.
    const back = across / 2 + G.setBack;
    const out = (roadWidth / 2 + G.out) * -approach;
    const x = crossing.x - fwd.x * back + r.x * out;
    const z = crossing.z - fwd.z * back + r.z * out;
    const place = { x, z, ry: roadHeading + (approach < 0 ? Math.PI : 0) };
    const put = (color: THREE.Color, geo: THREE.BufferGeometry): void => b.add(geo, color, place);
    const post = new THREE.BoxGeometry(0.1, G.post, 0.1);
    post.translate(0, G.post / 2, 0);
    put(TINT.post, post);
    for (const tilt of [Math.PI / 4, -Math.PI / 4]) {
      const rim = new THREE.BoxGeometry(G.width + G.rim * 2, G.arm + G.rim * 2, 0.04);
      rim.rotateZ(tilt);
      rim.translate(0, G.post - G.arm / 2, -0.07);
      put(TINT.rim, rim);
      const arm = new THREE.BoxGeometry(G.width, G.arm, 0.05);
      arm.rotateZ(tilt);
      arm.translate(0, G.post - G.arm / 2, -0.08);
      put(TINT.cross, arm);
    }
  }
  const mesh = new THREE.Mesh(b.build(), railMaterial());
  mesh.position.y = crossing.y;
  group.add(mesh);
  return group;
}

export { box as railBox };
