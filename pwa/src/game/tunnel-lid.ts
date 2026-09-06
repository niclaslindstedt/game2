// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R47 — THE LID: the mountain drawn back over a bore. Under a tunnel the
// ground lattice is a TRENCH — the corridor shelf at road level out to the
// lip, and the bare mountain beyond it — because the lattice is one height
// per point and the road's is the one the car needs. Seen from outside,
// that is a road-level slot cut through the massif along every bore. This
// draws the rock back over the slot: a surface following the bore's
// centreline at the height the country would stand at with the trench
// filled back in (`lidAt` — the bare mountain inside the lip, the ground
// as built everywhere else, so a neighbouring arm's cutting is followed
// rather than floated over), reaching a lattice cell past the lip on either
// side so its outer edge stands on lattice corners the lid rule and the
// tiles agree on, and meets the ground without a seam; and at each mouth a
// SKIRT — the rock face the road goes into, dropping from the lid's front
// edge to the road, with the portal gallery standing proud of it. Painted by the terrain's own paint, so the lid is
// the slope beside it continuing over the road.
//
// The lid is geometry only. The lattice under it is what the physics rides
// and the trench is what the car sees from the road — nothing here reaches
// either. The footprint (`corridorLip`, `lidHalfWidth`) is pure so the tests
// can hold it to the engine's shelf rule without a renderer.

import * as THREE from "three";
import {
  GROUND_CELL,
  ROAD_CROSS,
  corridorOffset,
  tunnelTrench,
  type Track,
  type TrackSample,
} from "@engine";
import { shareOne } from "../lib/shared-gpu.ts";

/** The lid's numbers, m. */
export const LID = {
  /** Sampling pitch along and across the bore: half a lattice cell, so the
   * lid follows a mountain the lattice draws at one vertex per cell. */
  pitch: GROUND_CELL / 2,
  /** How far past the TRENCH's edge the lid reaches (the trench itself
   * runs a bench past the lip — `tunnelTrench`). A whole cell and a
   * little: a point that far out sits in a lattice cell whose every corner
   * is outside the trench, so the lattice there is the bare mountain and
   * the lid's outer edge can be put exactly on it. */
  margin: GROUND_CELL + 2,
  /** How far the rock face stands BEHIND the gallery's face, so the
   * gallery is proud of the mountain and the two never share a plane. */
  faceBack: 0.6,
  /** How far under the road and the ground the skirt's foot is sunk, so no
   * daylight shows under it — and how far it reaches down behind the
   * gallery's roof, for the same reason. */
  footSink: 0.6,
  /** The skirt's own pitch across the face — finer than the lid's, because
   * its foot follows the drawn trench wall, which turns at every cell. */
  skirtPitch: 2,
  /** How many samples either side the lip is read over — the engine's own
   * envelope, so a mouth's flare widens the lid where it widens the shelf. */
  lipEnvelope: 4,
  /** The least the lid clears the vault's outside, m — a mountain the
   * search left thinner than the lining is tall is lifted this far over
   * it. The portal's gallery is NOT held under: its parapet may stand out
   * of a thin brow, which is what a real one does. */
  headroom: 0.3,
} as const;

/** The corridor's lip at sample `index`, m from the centreline — the
 * engine's shelf rule: the widest the mat REACHES within `lipEnvelope`
 * samples (a junction's mouth opens on one side, so its far edge stands
 * `shift + width / 2` out), plus the verge, and never narrower than the
 * nominal corridor. */
export function corridorLip(track: Track, index: number): number {
  const samples = track.samples;
  const lo = Math.max(0, index - LID.lipEnvelope);
  const hi = Math.min(samples.length - 1, index + LID.lipEnvelope);
  let widest = 0;
  for (let i = lo; i <= hi; i++) {
    const reach = 2 * Math.abs(samples[i].shift ?? 0) + samples[i].width;
    if (reach > widest) widest = reach;
  }
  return Math.max(track.width / 2 + ROAD_CROSS.reach, widest / 2 + ROAD_CROSS.reach);
}

/** How far either side of the centreline the lid reaches at sample
 * `index`, m: the lip, the trench's bench past it, and the margin. */
export function lidHalfWidth(track: Track, index: number): number {
  return corridorLip(track, index) + tunnelTrench(track.width) + LID.margin;
}

/** What the lid is laid on and painted with — the terrain's field and its
 * paint, handed in so this module never learns how the ground is built. */
export type LidGround = {
  /** The ground with the trench filled back in — the lid's own height. */
  lidAt: (x: number, z: number) => number;
  /** The bare country. `lidAt` reads it under the lip of a BORE sample;
   * the lid's front edge stands outside the mouth, where the nearest road
   * is the open approach and `lidAt` is its cutting — road level — so the
   * face over the road is read off the mountain directly. */
  farHeightAt: (x: number, z: number) => number;
  /** The drawn ground lattice — what the lid's edge and the skirt's foot
   * have to meet. */
  latticeAt: (x: number, z: number) => number;
  /** The country's paint for a surface with a height and slope of its own. */
  paintLand: (x: number, z: number, y: number, normalY: number, out: THREE.Color) => void;
  /** The tiles' own detail map, so the lid carries the ground's grain.
   * Handed in rather than imported: the map is drawn on a canvas, and this
   * module stays DOM-free so the tests can read the footprint. */
  grain: () => THREE.Texture;
};

/** What the lid has to clear: the portal gallery's half width, the height
 * of its roof over the road, how far its face stands out of the mouth
 * sample, and the height of the lining's outside at lateral `u`. */
export type LidClearance = {
  outer: number;
  roof: number;
  faceOut: number;
  topAt: (u: number) => number;
};

/** One material for every lid in the app, made on the first call with the
 * grain the first caller hands in — the grain is the app's one detail map,
 * so there is nothing for a later caller to disagree about. */
let lidMaterial: (() => THREE.MeshLambertMaterial) | null = null;
const lidMaterialWith = (grain: () => THREE.Texture): THREE.MeshLambertMaterial => {
  lidMaterial ??= shareOne(
    () =>
      new THREE.MeshLambertMaterial({ vertexColors: true, map: grain(), side: THREE.DoubleSide }),
  );
  return lidMaterial();
};

type Mouth = { index: number; inward: 1 | -1 };

/** One station across the bore: the lid's vertices left to right, and the
 * frame they were laid in. */
type Station = {
  sample: TrackSample;
  /** The station's centre — the sample, or the mouth's face plane. */
  x: number;
  z: number;
  rx: number;
  rz: number;
  halfW: number;
  lip: number;
  points: THREE.Vector3[];
  mouth: Mouth | null;
  /** Whether this chunk owns the station's mouth, and so its skirt. */
  owned: boolean;
};

/** The lid and the skirts for the bores in `samples[from..to)`, or null
 * where nothing on this stretch is bored. Partitioned as the lining is: the
 * strip between samples `from - 1` and `to - 1` is this chunk's, so every
 * metre of lid is drawn by exactly one chunk and neighbours meet on a
 * shared station. */
export function buildTunnelLid(
  track: Track,
  from: number,
  to: number,
  ground: LidGround,
  clear: LidClearance,
): THREE.Mesh | null {
  const samples = track.samples;
  const first = Math.max(0, from - 1);
  const last = Math.min(to, samples.length);
  const stride = Math.max(1, Math.round(LID.pitch / track.step));
  /** Columns each side of the centreline — fixed for the stage off the
   * nominal corridor, so neighbouring stations always pair up column for
   * column; a wider lip at a flare spreads the same columns further. */
  const cols = Math.ceil(lidHalfWidth(track, 0) / LID.pitch);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const n = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  /** A triangle wound so its geometric normal agrees with `hint`, with the
   * given per-vertex normals, colours and uvs. */
  const tri = (
    p: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    vn: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    vc: [THREE.Color, THREE.Color, THREE.Color],
    uv: [number, number][],
    hint: THREE.Vector3,
  ): void => {
    n.subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    const order = n.dot(hint) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const k of order) {
      positions.push(p[k].x, p[k].y, p[k].z);
      normals.push(vn[k].x, vn[k].y, vn[k].z);
      colors.push(vc[k].r, vc[k].g, vc[k].b);
      uvs.push(uv[k][0], uv[k][1]);
    }
  };

  const station = (i: number, mouth: Mouth | null): Station => {
    const s = samples[i];
    const rx = Math.cos(s.heading);
    const rz = -Math.sin(s.heading);
    // A mouth's station stands on the rock face's plane, `faceBack`
    // behind the gallery's face, outside the mouth along the bore's line.
    const along = mouth === null ? 0 : -mouth.inward * (clear.faceOut - LID.faceBack);
    const x = s.x + Math.sin(s.heading) * along;
    const z = s.z + Math.cos(s.heading) * along;
    const halfW = lidHalfWidth(track, i);
    const lip = corridorLip(track, i);
    const points: THREE.Vector3[] = [];
    for (let j = -cols; j <= cols; j++) {
      const u = (j * halfW) / cols;
      const px = x + rx * u;
      const pz = z + rz * u;
      let y: number;
      if (Math.abs(j) === cols) {
        // The outer edge is put ON the drawn lattice rather than on the
        // analytic country, because the two disagree by up to a metre
        // between lattice corners and the seam has to close exactly.
        y = ground.latticeAt(px, pz);
      } else if (mouth !== null && Math.abs(u) <= lip) {
        y = ground.farHeightAt(px, pz);
      } else {
        y = ground.lidAt(px, pz);
      }
      // Over the lining, and over the gallery's roof, nothing built stands
      // up through the rock — except the parapet, on purpose. Held one
      // column PAST the gallery's side, so the strip down to the next
      // column starts outside it: a column just inside the wall left the
      // next one free to fall to the ground, and the strip between them
      // cut down through the roof and, where the brow is thin, the vault.
      if (Math.abs(u) <= clear.outer + halfW / cols) {
        y = Math.max(y, s.elevation + Math.max(clear.topAt(u), clear.roof) + LID.headroom);
      }
      points.push(new THREE.Vector3(px, y, pz));
    }
    return { sample: s, x, z, rx, rz, halfW, lip, points, mouth, owned: i >= from };
  };

  /** The lid's own slope at each vertex of a run — central differences
   * over the drawn grid, the way the tiles take theirs off their lattice —
   * and the country's paint read with it, so a steep band the lid makes
   * where it meets a cutting's end paints as the rock it is. */
  const shade = (run: Station[]): { normals: THREE.Vector3[][]; colors: THREE.Color[][] } => {
    const across = new THREE.Vector3();
    const along = new THREE.Vector3();
    const vnormals: THREE.Vector3[][] = [];
    const vcolors: THREE.Color[][] = [];
    for (let i = 0; i < run.length; i++) {
      const row: THREE.Vector3[] = [];
      const tint: THREE.Color[] = [];
      const P = run[i].points;
      const before = run[Math.max(0, i - 1)].points;
      const after = run[Math.min(run.length - 1, i + 1)].points;
      for (let j = 0; j < P.length; j++) {
        across.subVectors(P[Math.min(P.length - 1, j + 1)], P[Math.max(0, j - 1)]);
        along.subVectors(after[j], before[j]);
        const normal = new THREE.Vector3().crossVectors(across, along).normalize();
        if (normal.y < 0) normal.negate();
        const color = new THREE.Color();
        ground.paintLand(P[j].x, P[j].z, P[j].y, normal.y, color);
        row.push(normal);
        tint.push(color);
      }
      vnormals.push(row);
      vcolors.push(tint);
    }
    return { normals: vnormals, colors: vcolors };
  };

  const uvOf = (p: THREE.Vector3): [number, number] => [p.x / 16, p.z / 16];

  /** The strip between two shaded stations. */
  const strip = (
    a: Station,
    b: Station,
    an: THREE.Vector3[],
    bn: THREE.Vector3[],
    ac: THREE.Color[],
    bc: THREE.Color[],
  ): void => {
    for (let j = 0; j + 1 < a.points.length; j++) {
      const a0 = a.points[j];
      const a1 = a.points[j + 1];
      const b0 = b.points[j];
      const b1 = b.points[j + 1];
      tri(
        [a0, b0, a1],
        [an[j], bn[j], an[j + 1]],
        [ac[j], bc[j], ac[j + 1]],
        [uvOf(a0), uvOf(b0), uvOf(a1)],
        UP,
      );
      tri(
        [a1, b0, b1],
        [an[j + 1], bn[j], bn[j + 1]],
        [ac[j + 1], bc[j], bc[j + 1]],
        [uvOf(a1), uvOf(b0), uvOf(b1)],
        UP,
      );
    }
  };

  /** The rock face under a mouth station's front edge: from the lid down
   * to the road under the lip and to the drawn ground beyond it, so it
   * tapers to nothing where the lid has met the mountain. */
  const skirt = (st: Station): void => {
    const s = st.sample;
    const mouth = st.mouth as Mouth;
    const outward = new THREE.Vector3(
      -mouth.inward * Math.sin(s.heading),
      0,
      -mouth.inward * Math.cos(s.heading),
    );
    /** The lid's front edge height at lateral `u` — linear between the
     * station's own columns, so the face shares the edge exactly. */
    const edgeAt = (u: number): number => {
      const f = ((u + st.halfW) / (2 * st.halfW)) * (st.points.length - 1);
      const k = Math.min(st.points.length - 2, Math.max(0, Math.floor(f)));
      const t = f - k;
      return st.points[k].y * (1 - t) + st.points[k + 1].y * t;
    };
    const footAt = (u: number, x: number, z: number): number => {
      // Behind the gallery the face comes down to its ROOF and no further:
      // the concrete covers the rest, and a face carried on to the road
      // there is a wall across the bore, seen through the gallery's
      // opening from both sides.
      if (Math.abs(u) <= clear.outer) return s.elevation + clear.roof - LID.footSink;
      let foot = ground.latticeAt(x, z);
      if (Math.abs(u) <= st.lip) {
        foot = Math.min(foot, s.elevation + corridorOffset(s, u, track.width));
      }
      return foot - LID.footSink;
    };
    const steps = Math.ceil((2 * st.halfW) / LID.skirtPitch);
    type Post = { top: THREE.Vector3; foot: THREE.Vector3; u: number };
    const posts: Post[] = [];
    for (let k = 0; k <= steps; k++) {
      const u = -st.halfW + (2 * st.halfW * k) / steps;
      const x = st.x + st.rx * u;
      const z = st.z + st.rz * u;
      const top = edgeAt(u);
      const foot = Math.min(top, footAt(u, x, z));
      posts.push({ top: new THREE.Vector3(x, top, z), foot: new THREE.Vector3(x, foot, z), u });
    }
    const tone = (p: THREE.Vector3): THREE.Color => {
      const out = new THREE.Color();
      ground.paintLand(p.x, p.z, p.y, 0, out);
      return out;
    };
    const faceUv = (p: THREE.Vector3, u: number): [number, number] => [u / 16, p.y / 16];
    for (let k = 0; k + 1 < posts.length; k++) {
      const a = posts[k];
      const b = posts[k + 1];
      // Nothing to draw where the lid is already on the ground.
      if (a.top.y - a.foot.y < 1e-3 && b.top.y - b.foot.y < 1e-3) continue;
      const ta = tone(a.top);
      const fa = tone(a.foot);
      const tb = tone(b.top);
      const fb = tone(b.foot);
      const ov = outward;
      tri(
        [a.top, a.foot, b.top],
        [ov, ov, ov],
        [ta, fa, tb],
        [faceUv(a.top, a.u), faceUv(a.foot, a.u), faceUv(b.top, b.u)],
        outward,
      );
      tri(
        [b.top, a.foot, b.foot],
        [ov, ov, ov],
        [tb, fa, fb],
        [faceUv(b.top, b.u), faceUv(a.foot, a.u), faceUv(b.foot, b.u)],
        outward,
      );
    }
  };

  // The stations, run by run; a run ends at any open sample.
  const runs: Station[][] = [];
  let run: Station[] | null = null;
  for (let i = first; i < last; i++) {
    const s = samples[i];
    if (!s.tunnel) {
      run = null;
      continue;
    }
    const enters = i === 0 || !samples[i - 1].tunnel;
    const leaves = i === samples.length - 1 ? !track.endless : !samples[i + 1].tunnel;
    const mouth: Mouth | null = enters
      ? { index: i, inward: 1 }
      : leaves
        ? { index: i, inward: -1 }
        : null;
    // A station at every stride, at both mouths, and at this chunk's two
    // ends so the neighbouring chunk's strip starts where this one stops.
    if (!(mouth !== null || i === first || i === last - 1 || i % stride === 0)) continue;
    if (run === null) runs.push((run = []));
    run.push(station(i, mouth));
  }
  for (const stations of runs) {
    const { normals: vn, colors: vc } = shade(stations);
    for (let i = 0; i + 1 < stations.length; i++) {
      strip(stations[i], stations[i + 1], vn[i], vn[i + 1], vc[i], vc[i + 1]);
    }
    // The mouth's skirt belongs to the chunk that owns the mouth sample,
    // as the portal does.
    for (const st of stations) if (st.mouth !== null && st.owned) skirt(st);
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, lidMaterialWith(ground.grain));
  mesh.receiveShadow = true;
  return mesh;
}
