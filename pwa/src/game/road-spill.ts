// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SPILL — the loose stones at the road's edge, and the reason a gravel
// road does not have one.
//
// R16 says the road runs out rather than stopping, and `road-mesh.ts` does
// the paint half of that: the surfacing dissolves into the ground's own
// colour along a noise field instead of ending at a line ruled parallel to
// the centerline. But a colour ramp reads as a BLURRED EDGE, which is a
// different defect from a sharp one and no more convincing. What reads as a
// road is the stones themselves: many of them at the shoulder, fewer a
// metre out, a scattering at three, and nothing at five. The ratio goes
// from all gravel to all grass and nowhere along it is there a line.
//
// So this scatters them, on the SAME noise field the paint dissolves along
// — where the ground shows through in the colour is where the stones have
// run out too, rather than the two disagreeing and reading as two effects.
//
// Nothing here is solid. Every stone is a few centimetres of chipping the
// car drives straight over, which is what makes it safe to place app-side
// with no engine state and no determinism to keep: anything a driver could
// actually hit is a prop the ENGINE placed and the wild cells draw.

import * as THREE from "three";
import { ROAD_CROSS, type Rng, type Track } from "@engine";

import { valueNoise } from "../lib/noise.ts";
import { rightOf } from "./ribbon.ts";

/** How far the dissolve at the road's edge wanders, and how big its patches
 * are, m. R16 — a gravel road has no EDGE, it has a TRANSITION: many stones
 * become fewer stones become none, and the line where one ends and the grass
 * begins is not a line at all. A boundary ruled parallel to the centerline
 * is the single most visible thing about a generated road from any distance,
 * and it is what the last one had: the fade was a straight lerp between two
 * colours across a band of fixed width.
 *
 * `spread` is how much of the band the dissolve can push the boundary either
 * way (0 is the ruled line back again, 1 is the whole band); `patch` is the
 * wavelength of the noise doing the pushing, chosen at the size of the thing
 * being scattered — a couple of metres, so what comes out is fingers of
 * gravel reaching into the grass rather than a per-vertex pepper that reads
 * as noise on the texture. `seed` is fixed rather than per-stage: what it
 * decides is the shape of a boundary a metre wide, and nobody has ever seen
 * two stages' road edges side by side.
 *
 * It lives HERE, in the module that scatters the stones, and `road-mesh.ts`
 * reads it for the paint — one field, so the colour and the scatter agree
 * instead of reading as two effects laid over each other. The direction of
 * the import is also what keeps this module free of the canvas work the road
 * mesh's textures do, which is what lets a plain-Node test build a spill. */
export const DISSOLVE = { spread: 0.85, patch: 2.6, seed: 0x51ed3f7b };

/** How far past the road's edge a stone may end up, m. A little past the
 * corridor's own lip: the last few are the ones out in the grass, and a
 * scatter that stopped exactly where the ribbon does would draw the line
 * back in by putting the outermost stone on it. */
const REACH = ROAD_CROSS.reach + 1.6;

/** Candidate stones per road sample per side — samples are 2 m apart, so
 * this is the density knob. High, because the effect IS the density: a
 * dozen stones scattered along a kilometre of verge is litter, and what a
 * road's edge is made of is hundreds of them per metre thinning to none. */
const TRIES = 8;

/** Where a candidate lands, in meters out from the road edge, from a
 * uniform roll. Squared, which puts most of them against the shoulder and
 * trails the rest off with no visible outer limit — a uniform draw leaves
 * an even scatter that ENDS somewhere, which is the ruled line again with
 * stones instead of paint. */
function spread(u: number): number {
  return 0.05 + (REACH - 0.05) * u * u;
}

/** Stone size, m — the small end of the chipping band, shrinking outward.
 * The big ones stay by the road because that is where the blade left them;
 * what gets kicked and washed out into the grass is the fine stuff. Small
 * on purpose: these are CHIPPINGS. At a hand's width they read as the
 * surface breaking up, and at a boot's width as rubble somebody tipped. */
const SIZE = { near: 0.115, far: 0.04 };

export type RoadSpill = {
  mesh: THREE.InstancedMesh;
  /** Zero out every stone at a point the caller now claims — road built
   * later on an endless run runs through ground this chunk had scattered. */
  retire: (hits: (x: number, z: number) => boolean) => void;
  dispose: () => void;
};

/** Scatter the spill along one chunk of road, `from` to `to` in samples.
 * `groundAt` is the DRAWN surface (the terrain field's, not the analytic
 * height): in the hand-over band those two differ by the whole of R16's
 * blend, and a stone placed on the analytic one floats over the road it is
 * supposed to be lying on. `blocked` rejects water, and the caller's own
 * road-clearance walk keeps the scatter off any other road. */
export function buildRoadSpill(
  track: Track,
  from: number,
  to: number,
  rng: Rng,
  density: number,
  groundAt: (x: number, z: number) => number,
  blocked: (x: number, z: number) => boolean,
): RoadSpill {
  const samples = track.samples;
  type Stone = { x: number; y: number; z: number; size: number; spin: number; tone: number };
  const stones: Stone[] = [];
  for (let i = Math.max(1, from); i < to; i++) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const half = (s.width ?? track.width) / 2;
    for (const side of [-1, 1]) {
      for (let n = 0; n < TRIES; n++) {
        if (density < 1 && !rng.chance(density)) continue;
        const t = rng.next();
        const out = spread(t);
        const lateral = (half + out) * side;
        // Jittered along the road too, or the stones stand in ranks two
        // metres apart and the rank is the line all over again.
        const along = rng.range(-1, 1);
        const x = s.x + r.x * lateral + Math.sin(s.heading) * along;
        const z = s.z + r.z * lateral + Math.cos(s.heading) * along;
        // The paint's own dissolve field, so a stone only lies where the
        // surfacing has not yet given way — the colour and the scatter
        // agree instead of reading as two effects laid over each other.
        const g = valueNoise(x, z, DISSOLVE.patch, DISSOLVE.seed);
        if (t > g + 0.3) continue;
        if (blocked(x, z)) continue;
        stones.push({
          x,
          y: groundAt(x, z),
          z,
          size: SIZE.near + (SIZE.far - SIZE.near) * t,
          spin: rng.next() * Math.PI * 2,
          tone: rng.next(),
        });
      }
    }
  }

  // A TETRAHEDRON, squashed and half sunk: four triangles a stone, and a
  // stage carries fifteen thousand of them. That count is the whole effect
  // and the whole cost — an eight-triangle lump doubles the stage's triangle
  // budget for a shape nobody resolves, because at a hand's width, passed at
  // a hundred and forty, what reads is the speckle and not the silhouette.
  // (Measured: the octahedron this started as put the driving frame up 42%.)
  const geo = new THREE.TetrahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, stones.length));
  mesh.count = stones.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  // The road's own two greys, and mostly the worn one: a chipping that lies
  // in the verge has been rained on. A scatter at the pale end reads as
  // paper on the ground rather than as stone.
  const pale = new THREE.Color(0xc9ad86);
  const dark = new THREE.Color(0x6f5a3a);
  stones.forEach((p, i) => {
    q.setFromAxisAngle(up, p.spin);
    // Bedded in the dirt rather than balanced on it, and a lump rather than
    // a flake — flattened much past this a stone reads from above as a
    // square of paper, which is what the first pass at these looked like.
    m.compose(v.set(p.x, p.y - p.size * 0.15, p.z), q, sc.set(p.size, p.size * 0.8, p.size));
    mesh.setMatrixAt(i, m);
    tint.copy(pale).lerp(dark, 0.25 + p.tone * 0.7);
    mesh.setColorAt(i, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const retire = (hits: (x: number, z: number) => boolean): void => {
    let touched = false;
    stones.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      mesh.setMatrixAt(i, zero);
      touched = true;
    });
    if (touched) mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  return { mesh, retire, dispose };
}
