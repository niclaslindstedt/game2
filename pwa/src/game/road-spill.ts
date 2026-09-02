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
import { ROAD_CROSS, isLoose, wearAt, type Rng, type Track } from "@engine";

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

/** How far past the road's edge a stone may end up, m. WELL past the
 * corridor's own lip, which is where the road mesh stops: the last stones
 * are the ones lying out in open grass, and a scatter that ended where the
 * ribbon does would draw the boundary back in by putting its outermost
 * stone exactly on it. */
export const REACH = ROAD_CROSS.reach + 5;

/** Candidate stones per road sample per side — samples are 2 m apart, so
 * this is the density knob. High, because the effect IS the density: a
 * dozen stones scattered along a kilometre of verge is litter, and what a
 * road's edge is made of is hundreds of them per metre thinning to none. */
const TRIES = 8;

/** ...and candidates ON THE MAT, per sample per side. A gravel road is not
 * a painted surface with stones beside it: it is made of the stones, and at
 * the height a driver's eye sits the loose ones catching the light are most
 * of what says so. Fewer than the verge gets, because the road is DRIVEN —
 * see `matKeep`. */
const MAT_TRIES = 2;

/** ...and tufts of grass, per sample per side. The other direction of the
 * same hand-over: the stones run out into the country and the country grows
 * back in, on the same noise field, so the two interlock instead of meeting.
 * Sparser than the stones: a tuft costs the same four triangles but stands
 * up, so it is a far bigger thing on screen and a great many fewer of them
 * read as a verge. */
const GRASS_TRIES = 3;

/** Where a candidate lands, in meters out from the road edge, from a
 * uniform roll. Squared, which puts most of them against the shoulder and
 * trails the rest off with no visible outer limit — a uniform draw leaves
 * an even scatter that ENDS somewhere, which is the ruled line again with
 * stones instead of paint. */
function spread(u: number): number {
  return 0.05 + (REACH - 0.05) * u * u;
}

/** How much of a stone survives being DRIVEN OVER, 0..1, from the road's own
 * wear map: none in the two wheel tracks and across the swept crown, all of
 * it out at the loose margins the blade left and no tire has touched. This
 * is the whole reason stones on the mat read as a road surface rather than
 * as gravel tipped on tarmac — the pattern they make is the pattern of what
 * drives here, which is the same pattern `wearAt` paints. */
function matKeep(lateral: number, width: number): number {
  const kept = 1 - wearAt(lateral, width);
  return kept * kept;
}

/** Stone size, m — the small end of the chipping band, shrinking outward.
 * The big ones stay by the road because that is where the blade left them;
 * what gets kicked and washed out into the grass is the fine stuff. Small
 * on purpose: these are CHIPPINGS. At a hand's width they read as the
 * surface breaking up, and at a boot's width as rubble somebody tipped. */
const SIZE = { near: 0.115, far: 0.04 };

/** ...and on the mat, smaller again. A stone standing proud of a road the
 * car is about to cross at speed has to be under the threshold where the
 * eye reads it as an OBSTACLE — nothing here is solid, and a chipping that
 * looks like it should have been is worse than no chipping. */
const MAT_SIZE = { near: 0.075, far: 0.035 };

/** How far a stone is lifted out of the surface it lies on, m. The road
 * ribbon is drawn a hair proud of the height the terrain field reports
 * (`buildRoad`'s bias), so a stone bedded at exactly that height is a stone
 * inside the road. */
const LIFT = 0.03;

/** Grass tuft size, m: how tall a blade stands and how wide the tuft is. A
 * verge is ankle-high — taller than this and the tufts read as a crop, and
 * they start hiding the very transition they are there to make. */
const BLADE = { high: 0.3, wide: 0.13 };

export type RoadSpill = {
  /** The stones and the grass, as two instanced meshes: one geometry and
   * one draw call each, whatever the count. */
  meshes: THREE.InstancedMesh[];
  /** Zero out every stone and tuft at a point the caller now claims — road
   * built later on an endless run runs through ground this chunk had
   * scattered. */
  retire: (hits: (x: number, z: number) => boolean) => void;
  dispose: () => void;
};

/** Scatter the spill along one chunk of road, `from` to `to` in samples.
 * `groundAt` is the DRAWN surface (the terrain field's, not the analytic
 * height): in the hand-over band those two differ by the whole of R16's
 * blend, and a stone placed on the analytic one floats over the road it is
 * supposed to be lying on. `paintAt` is the country's own colour, so a tuft
 * growing out of the verge is the green the ground beside it already is
 * rather than a green of its own. `blocked` rejects water, and the caller's
 * own road-clearance walk keeps the scatter off any other road. */
export function buildRoadSpill(
  track: Track,
  from: number,
  to: number,
  rng: Rng,
  density: number,
  groundAt: (x: number, z: number) => number,
  paintAt: (x: number, z: number, out: THREE.Color) => void,
  blocked: (x: number, z: number) => boolean,
): RoadSpill {
  const samples = track.samples;
  type Stone = { x: number; y: number; z: number; size: number; spin: number; tone: number };
  type Tuft = { x: number; y: number; z: number; size: number; spin: number; shade: number };
  const stones: Stone[] = [];
  const tufts: Tuft[] = [];
  for (let i = Math.max(1, from); i < to; i++) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const width = s.width ?? track.width;
    const half = width / 2;
    // Along-road jitter, or everything stands in ranks two metres apart and
    // the rank is the line all over again.
    const place = (lateral: number): { x: number; z: number } => {
      const along = rng.range(-1, 1);
      return {
        x: s.x + r.x * lateral + Math.sin(s.heading) * along,
        z: s.z + r.z * lateral + Math.cos(s.heading) * along,
      };
    };
    for (const side of [-1, 1]) {
      // ── ON THE MAT. Loose chippings on the road itself, thinning to
      // nothing down the two tracks every car before you drove in. A sealed
      // run gets none: tarmac's own loose stone is the chipping band down
      // its edge, which `buildChippings` already lays.
      if (isLoose(s.surface) && s.deck == null) {
        for (let n = 0; n < MAT_TRIES; n++) {
          if (density < 1 && !rng.chance(density)) continue;
          const t = rng.next();
          const lateral = half * t * side;
          if (!rng.chance(matKeep(lateral, width))) continue;
          const { x, z } = place(lateral);
          if (blocked(x, z)) continue;
          const u = rng.next();
          stones.push({
            x,
            y: groundAt(x, z) + LIFT,
            z,
            size: MAT_SIZE.near + (MAT_SIZE.far - MAT_SIZE.near) * u,
            spin: rng.next() * Math.PI * 2,
            tone: rng.next(),
          });
        }
      }
      // ── PAST THE EDGE. The chippings that ran off the mat, thinning out
      // across the hand-over band and trailing away into open grass.
      for (let n = 0; n < TRIES; n++) {
        if (density < 1 && !rng.chance(density)) continue;
        const t = rng.next();
        const out = spread(t);
        const lateral = (half + out) * side;
        const { x, z } = place(lateral);
        // The paint's own dissolve field, so a stone only lies where the
        // surfacing has not yet given way — the colour and the scatter
        // agree instead of reading as two effects laid over each other.
        // The allowance is generous rather than tight: past the boundary
        // the grass has won the COLOUR, and a thinning scatter of stones
        // lying in it is what stops that boundary being where the road
        // stops. They simply have to run out before the grass does.
        const g = valueNoise(x, z, DISSOLVE.patch, DISSOLVE.seed);
        if (t > g + 0.5) continue;
        if (blocked(x, z)) continue;
        stones.push({
          x,
          y: groundAt(x, z) + LIFT,
          z,
          size: SIZE.near + (SIZE.far - SIZE.near) * t,
          spin: rng.next() * Math.PI * 2,
          tone: rng.next(),
        });
      }
      // ── AND THE OTHER WAY. Grass coming back in over the gravel, on the
      // SAME field read the other way round: where the stones have thinned
      // the tufts have taken, so the two interlock along one boundary
      // instead of each drawing an edge of its own. On a LOOSE road they
      // reach a little way onto the mat — the margin no wheel touches is
      // exactly where a verge starts closing a road in — and stop dead at
      // the wheel tracks, which is what `matKeep` says and what a driven
      // road looks like.
      //
      // NOTHING GROWS OUT OF TARMAC. A sealed mat is a poured surface with
      // an edge, and a bridge deck is a slab over a river: the verge stops
      // at both of them, so their tufts only ever go outward. The roll is
      // still taken either way, so the two surfaces scatter the same verge
      // from the same stream and only the reach onto the road differs.
      const closes = isLoose(s.surface) && s.deck == null;
      for (let n = 0; n < GRASS_TRIES; n++) {
        if (density < 1 && !rng.chance(density)) continue;
        const t = rng.next();
        const out = spread(t);
        // Half of them grow inward of the road's edge rather than outward.
        const inward = rng.chance(0.5) && closes;
        const lateral = inward ? Math.max(0, half - out * 0.35) * side : (half + out) * side;
        if (inward && !rng.chance(matKeep(lateral, width))) continue;
        const { x, z } = place(lateral);
        const g = valueNoise(x, z, DISSOLVE.patch, DISSOLVE.seed);
        // The inverse of the stones' gate: a tuft stands where the ground
        // has taken the colour, and thins going in the way they thin going
        // out.
        if (t < g - 0.35) continue;
        if (blocked(x, z)) continue;
        tufts.push({
          x,
          y: groundAt(x, z),
          z,
          size: 0.7 + rng.next() * 0.6,
          spin: rng.next() * Math.PI * 2,
          shade: rng.next(),
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

  // A TUFT: two quads crossed at the stem, four triangles, hinged at the
  // ground and leaning. Crossed rather than one billboard because this is
  // looked at from a car's eye AND from straight above on the map, and a
  // single quad vanishes edge-on from one of them. Everything else about
  // it is the stones' economics — no shadow, one draw call, and the count
  // is the effect.
  const grassGeo = ((): THREE.BufferGeometry => {
    const w = BLADE.wide / 2;
    const h = BLADE.high;
    // FOUR BLADES, each one TRIANGLE: wide at the root, meeting at a point
    // overhead, splayed to the four quarters and leaning out as they go.
    // Four triangles a tuft, the same as a stone.
    //
    // Triangles rather than quads, and this is the whole difference between
    // grass and litter: a quad standing on the ground is a CARD, it has a
    // square top edge, and a verge full of them reads as a row of tiny
    // signs. A blade has a point. At the size these are actually seen —
    // ankle high, passed at speed — the silhouette is all there is, and the
    // silhouette is the taper.
    const pos: number[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      // Root, across the lean; the other root; and the tip, out and up.
      pos.push(-cz * w, 0, cx * w, cz * w, 0, -cx * w, cx * h * 0.35, h, cz * h * 0.35);
    }
    // Every normal points UP, at the sky rather than out of the blade. A
    // blade lit by its own facing goes black the moment it faces away from
    // the sun, and a verge half of whose tufts are black reads as burnt
    // ground; lit as if it were the ground it grows out of, the tuft sits
    // in the sheet of grass instead of standing on top of it.
    const nor = Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return geo;
  })();
  const grassMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, Math.max(1, tufts.length));
  grass.count = tufts.length;
  const ground = new THREE.Color();
  tufts.forEach((p, i) => {
    q.setFromAxisAngle(up, p.spin);
    m.compose(v.set(p.x, p.y, p.z), q, sc.set(p.size, p.size * (0.8 + p.shade * 0.5), p.size));
    grass.setMatrixAt(i, m);
    // The ground's OWN colour, darkened: a blade standing in shadow of its
    // neighbours is always darker than the sheet it grows out of, and
    // taking the colour from the terrain rather than from a palette here is
    // what keeps the verge the same green as the field on every biome, in
    // every season, and on the bare rock where it should barely be green at
    // all.
    paintAt(p.x, p.z, ground);
    ground.multiplyScalar(0.82 + p.shade * 0.3);
    grass.setColorAt(i, ground);
  });
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.castShadow = false;

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const retire = (hits: (x: number, z: number) => boolean): void => {
    let touchedStones = false;
    stones.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      mesh.setMatrixAt(i, zero);
      touchedStones = true;
    });
    if (touchedStones) mesh.instanceMatrix.needsUpdate = true;
    let touchedGrass = false;
    tufts.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      grass.setMatrixAt(i, zero);
      touchedGrass = true;
    });
    if (touchedGrass) grass.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
    grassGeo.dispose();
    grassMat.dispose();
  };

  return { meshes: [mesh, grass], retire, dispose };
}
