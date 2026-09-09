// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS DRAWN ROUND THE ROAD RATHER THAN AS IT: the skirts that close
// the gap between the ribbon's edge and the ground beside it, the painted
// markings a sealed road carries, the chippings thrown along a bladed one,
// and the sheet of water lying in a ford. Each is its own mesh over the
// same samples `road-mesh.ts` built the ribbon from, and each is dropped
// entirely where the road it belongs to is not that kind of road.

import * as THREE from "three";
import { ROAD_CROSS, corridorOffset, junctionFlat, junctionMainEdge, type Track } from "@engine";

// The dissolve field is the SPILL's — one field, so the paint's boundary and
// the scattered stones agree instead of reading as two effects.

// Straight from the engine rather than through terrain.ts: the ground's
// paint reads this module's palette for R16's dust wash, and the two must
// not import each other.
import { rightOf, type Ribbon } from "./ribbon.ts";
import { waterMaterial } from "./water-look.ts";
import {
  BORDER_FILLET,
  clamp01,
  junctionAt,
  junctionMats,
  mainEdgeAt,
  onMainMat,
  UP,
  type GroundBeside,
} from "./road-mesh.ts";

/** Dirt skirts: close the gap between the ribbon's outer lip and the ground
 * lattice under it, so a raised road (ramps, crests, an asphalt mat) reads
 * as a solid landform and never as floating carpet. A bridge deck gets
 * none — there is nothing under a bridge but air and water.
 *
 * **It hangs from the vertex the RIBBON ends at, which is not the ribbon's
 * own analytic height.** R16 spends the hand-over across the outer band, so
 * the ribbon's last vertex is the ground's height there and not the road's
 * — and the terrain sinks its shelf a little under the corridor besides. A
 * skirt hung from `corridorOffset` alone therefore stands a third of a metre
 * proud of the road it is closing, and what that draws is a dirt-coloured
 * stripe running the whole length of the stage a few metres out in the
 * grass: the very vertical face R16 exists to remove, put back by the mesh
 * that was supposed to hide it. `ground` is the same landscape `buildRoad`
 * hands over to, and the hand-over has spent the lift by the lip in both,
 * so the two meshes share an edge exactly. Without a landscape (the stage
 * previews draw a ribbon and nothing else) the analytic height is all there
 * is, and `bias` is the lift that goes with it. */
export function buildSkirts(
  track: Track,
  samples: Ribbon[],
  width: number,
  bias = 0.02,
  ground?: GroundBeside,
): THREE.Mesh {
  const half = width / 2;
  const edge = half + ROAD_CROSS.reach;
  const mats = junctionMats(track);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1]) {
    let start = positions.length / 3;
    let run = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.deck != null) {
        // Break the strip: the next stretch of ground starts its own.
        start = positions.length / 3;
        run = 0;
        continue;
      }
      const r = rightOf(s.heading);
      // R33 — the ribbon scales its whole cross-section, verge and all, with
      // the road's width HERE, so the lip moves in and out along the stage
      // and the skirt has to move with it.
      const here = s.width ?? width;
      const want = edge * (here / width) * side;
      // R17 — and it stops where the border does. The skirt hangs off the
      // ribbon's outer lip to close it to the ground, so it has to be at
      // the lip the ribbon actually drew — filleted in at a junction, and
      // absent altogether where the lip would be standing on another
      // road's mat. Left at its full width it hangs a wedge of raised dirt
      // out over the tarmac beside every mouth, which is a bank of earth
      // in the middle of somebody's carriageway.
      const wx = s.x + r.x * want;
      const wz = s.z + r.z * want;
      const over = mainEdgeAt(track, wx, wz);
      const paved = mats.some((m) => (m.x - wx) * (m.x - wx) + (m.z - wz) * (m.z - wz) < m.r * m.r);
      const keep = paved ? 0 : over === null ? 1 : clamp01(over / BORDER_FILLET);
      if (keep <= 0) {
        start = positions.length / 3;
        run = 0;
        continue;
      }
      const rim = (here / 2) * side;
      const at = rim + (want - rim) * keep;
      const ex = s.x + r.x * at;
      const ez = s.z + r.z * at;
      // R16 — the ribbon's last vertex, computed the way `buildRoad`
      // computes it: the ground's own height past the hand-over, except
      // inside a junction, where there is no hand-over to make (R17).
      const handed = ground !== undefined && (s.flat ?? 0) < 0.25;
      const top = handed
        ? ground.heightAt(ex, ez)
        : s.elevation + corridorOffset(s, at, here) + bias;
      // The skirt drops a few meters below grade — deep enough to meet the
      // terrain shelf under every roll of the road.
      positions.push(ex, top, ez, ex, top - 5, ez);
      if (run > 0) {
        const a = start + (run - 1) * 2;
        if (side > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      run += 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: "#8a6f4d", side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** The road's PAINT: the lines a road carries because a highways department
 * painted them there — a solid white edge line and a dashed centre on the
 * tarmac sections, which is most of what makes them read as a road the
 * rally borrowed rather than a differently-colored stripe.
 *
 * A gravel road gets NONE. Nobody paints a forest road, and what marks a
 * rally stage is the rally's own striped marking — which R26 puts at the
 * corners that need it rather than down the whole stage, and which is
 * therefore not a line at all but a run of objects. That lives in
 * `kerbs.ts`. Fords and bridge decks carry nothing either way. Markings run
 * the stage proper, never the aprons — pass the bare range. */
export function buildMarkings(
  track: Track,
  samples: Ribbon[],
  width: number,
  /** True where these samples are an abandoned BRANCH. A branch is the main
   * road continued past the crossing, so its paint runs the whole way to
   * the meeting point; only the route can be the minor road at a junction,
   * and only the route's arc means anything measured against one. */
  branch = false,
): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const paint = new THREE.Color("#e6e2d2");

  /** One strip of paint along the road: a band between two lateral offsets
   * that only exists where `on` says it does. */
  const strip = (
    from: (s: Ribbon) => number,
    to: (s: Ribbon) => number,
    on: (s: Ribbon) => boolean,
    color: (s: Ribbon) => THREE.Color | null,
    flip: boolean,
  ): void => {
    let start = positions.length / 3;
    let run = 0;
    for (const s of samples) {
      const tint = on(s) ? color(s) : null;
      if (!tint) {
        start = positions.length / 3;
        run = 0;
        continue;
      }
      const r = rightOf(s.heading);
      const inner = from(s);
      const outer = to(s);
      const yIn = s.elevation + corridorOffset(s, inner, width) + 0.035;
      const yOut = s.elevation + corridorOffset(s, outer, width) + 0.035;
      positions.push(
        s.x + r.x * inner,
        yIn,
        s.z + r.z * inner,
        s.x + r.x * outer,
        yOut,
        s.z + r.z * outer,
      );
      colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      if (run > 0) {
        const a = start + (run - 1) * 2;
        if (flip) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      run += 1;
    }
  };

  /** R17 — is this piece of road the MINOR one at a crossing? The paint
   * belongs to the road that runs THROUGH, and at a junction the route is
   * only that road on one side of the meeting point: joining, it is the
   * tarmac from the meeting point on; leaving, up to it. On the other side
   * it is the dirt road turning off, whose mat is still sealed for the
   * width of the crossing and carries no line at all — painted from there,
   * the tarmac's edge line runs round the outside of the gravel road's
   * mouth, which is a white line where no road has an edge. */
  const minor = (s: Ribbon): boolean =>
    !branch &&
    track.junctions.some(
      (j) =>
        junctionFlat(j, s.x, s.z) > 0 &&
        (j.joining ? s.s < j.s : s.s > j.s) &&
        // ...and only while it is still OFF the main road's mat. The route
        // is on the tarmac from where its line first reaches that mat,
        // which is `onMainRun` metres short of the meeting point — some
        // twenty of them — and over that stretch it IS the main road, so
        // it carries the main road's paint. Judged on the side alone, the
        // through road lost its centre line for the length of every
        // crossing: a dashed line that stops dead at a farm track and
        // starts again past it.
        (junctionMainEdge(j, s.x, s.z) ?? 1) > 0,
    );
  const plain = (s: Ribbon): boolean => s.surface === "asphalt" && s.deck == null && !minor(s);

  /** R17 — the minor road's own MAT at each crossing: the samples that make
   * its mouth. What the through road's edge line breaks for is that mouth,
   * so the break is measured against the thing itself rather than against
   * the platform — which is tens of metres longer than the opening — and a
   * side, which the geometry answers badly and the mat answers exactly. */
  const mouthMats = track.junctions.map((j) =>
    track.samples.filter(
      (s) => Math.abs(s.s - j.s) < j.reach * 2 && (j.joining ? s.s < j.s : s.s > j.s),
    ),
  );
  /** How far past that mat the break still reaches, m: the opening is the
   * mat plus the ground either side that a car turning in crosses, and a
   * break cut to the mat exactly leaves a stub of line inside the mouth. */
  const MOUTH_PAD = 2.5;
  const inMouth = (x: number, z: number): boolean =>
    mouthMats.some((mat) =>
      mat.some(
        (s) =>
          Math.hypot(s.x - x, s.z - z) <
          Math.abs(s.shift ?? 0) + (s.width ?? width) / 2 + MOUTH_PAD,
      ),
    );
  // Nothing ELSE here stops for a junction. Both arms of the sealed road
  // keep their lines right across it, exactly as a country road does past a
  // farm track: a junction that takes the tarmac's markings away for fifty
  // meters is what makes two roads read as dissolving into each other
  // instead of one running past the other.
  for (const side of [-1, 1]) {
    // Asphalt: a solid white edge line, a hand's width inside the kerb —
    // interrupted for a side road's MOUTH, on that side only. A line ruled
    // across the opening is a kerb where a car turns in.
    strip(
      (s) => ((s.width ?? width) / 2 - 0.65) * side,
      (s) => ((s.width ?? width) / 2 - 0.3) * side,
      (s) => {
        if (!plain(s)) return false;
        const r = rightOf(s.heading);
        const lat = ((s.width ?? width) / 2 - 0.475) * side;
        return !inMouth(s.x + r.x * lat, s.z + r.z * lat);
      },
      () => paint,
      side > 0,
    );
  }
  // ...and the broken centre line, 3 m of paint every 9.
  strip(
    () => -0.16,
    () => 0.16,
    (s) => plain(s) && s.s % 9 < 3,
    () => paint,
    false,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** The chippings that spill down an asphalt mat's edge. Asphalt is LAID —
 * a mat built up on the ground with nothing holding its sides — so its
 * edge is always a scatter of loose stone rather than a clean line, and
 * that scatter is most of what tells you the road stands proud. */
export function buildChippings(
  track: Track,
  samples: Ribbon[],
  width: number,
): THREE.InstancedMesh | null {
  const half = width / 2;
  const stones: { x: number; y: number; z: number; s: number; spin: number }[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s.surface !== "asphalt" || s.deck != null) continue;
    if (junctionAt(track, s.x, s.z) > 0.25 || onMainMat(track, s.x, s.z)) continue;
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      // Two rows per side, jittered off the sample index so the scatter
      // never lines up into a rail.
      const jitter = ((i * 2654435761) % 1000) / 1000;
      const out = half + ROAD_CROSS.chamfer * (0.4 + jitter * 0.9);
      const x = s.x + r.x * out * side;
      const z = s.z + r.z * out * side;
      stones.push({
        x,
        y: s.elevation + corridorOffset(s, out * side, width),
        z,
        s: 0.1 + jitter * 0.22,
        spin: jitter * Math.PI * 2,
      });
    }
  }
  if (stones.length === 0) return null;
  const geo = new THREE.DodecahedronGeometry(1);
  const mat = new THREE.MeshLambertMaterial({ color: "#7f7a70" });
  const mesh = new THREE.InstancedMesh(geo, mat, stones.length);
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  stones.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.spin);
    m.compose(v.set(p.x, p.y + p.s * 0.3, p.z), q, sc.set(p.s, p.s * 0.7, p.s));
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

/** Ford overlays: a wider translucent water sheet over each water run.
 * Only draws runs that COMPLETE before `to`; returns where the next call
 * should resume so a run straddling a chunk boundary is drawn whole by the
 * chunk that owns its end. */
export function buildFords(
  track: Track,
  from: number,
  to: number,
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
    // Flat and lit from above, like the lakes: the crossing is a sheet of
    // standing water and reads as one. The material is the app's shared
    // water look rather than one built per ford — the same blue, and one
    // program to bind however many crossings a stage has.
    const normals = new Float32Array(positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    const sheet = new THREE.Mesh(geo, waterMaterial());
    sheet.receiveShadow = true;
    group.add(sheet);
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
