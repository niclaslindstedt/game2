// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR PARK, drawn (R42). The engine decided everything — where the pad
// is and which way it is graded, where the lane in comes from, where every
// bay is and which of them has a car in it, where each trail runs to which
// stand and where the boards along it stand (`engine/mapgen/carparks.ts`).
// This module builds what it was told: the lane as a road ribbon (the same
// skirts and mat as a homestead's drive), the pad as a disc of gravel on
// the plane the terrain graded, the bays as whitewashed lines across it,
// the cars as ONE merged mesh of the parked-car boxes (`parked-car.ts`
// promised a car park of these, and this is it), the trails as trodden
// strips of earth laid on the ground, the arrow boards beside them, and
// the P at the gate.
//
// The cars are solid — the terrain field stands them up from the same
// record. The boards and the P are not: they go into the cone field, so a
// car that leaves the road through one knocks it flat.

import * as THREE from "three";
import {
  createRng,
  padHeight,
  parkBays,
  STAGE_RULES,
  type CarPark,
  type Track,
  type TrailSign,
} from "@engine";
import type { ConeField } from "./cones.ts";
import { GeoBuilder } from "./flora-build.ts";
import { parkedCarGeometry, parkedCarSpec } from "./parked-car.ts";
import { buildRoad, buildSkirts, type GroundBeside } from "./road-mesh.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture, gravelTexture, parkingSignTexture, trailSignTexture } from "./textures.ts";

const P = STAGE_RULES.carPark;

/** The pad's gravel: the road's own speckle, a shade greyer than a yard's
 * — a car park is driven over all day and raked never. */
const padMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ map: gravelTexture(), color: 0xcdbf9f }),
);

/** The cars, the lines and the posts: vertex-coloured, lit like the rest of
 * what stands still. */
const builtMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** The trail: trodden earth, drawn a hair over the ground and pulled toward
 * the eye by the offset so the lattice under it never wins the depth test
 * across a slope. */
const trailMaterial = shareOne(
  () =>
    new THREE.MeshLambertMaterial({
      color: 0x8a7350,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
);

const TINT = {
  line: new THREE.Color(0xe6e0d0),
  post: new THREE.Color(0x8b7355),
  board: new THREE.Color(0xf4f1e6),
};

/** How far the pad's gravel is drawn above the plane the terrain graded
 * under it: enough to win the depth test, not enough to be a step. */
const PAD_LIFT = 0.04;

/** The bay lines: how wide the whitewash is, m, and how far it stands
 * proud of the gravel. */
const LINE = { width: 0.12, lift: 0.015 };

/** The trail's strip: its width is the engine's; this is how far above the
 * ground it lies and how finely it follows the ground between samples. */
const TRAIL = { lift: 0.05, step: 1.5 };

/** An arrow board: the post it stands on and the board's size, m. */
const SIGN = { post: { w: 0.09, h: 1.7 }, board: { w: 0.8, h: 0.4 } };

/** The P at the gate: a square board on a taller post. */
const GATE = { post: { w: 0.1, h: 2.3 }, board: 0.6 };

/** Merge whole geometries — position, normal, colour and uv, all of which
 * the parked-car builder emits — into one. `car/builder.ts`'s own merge
 * keeps position and colour alone, which is right for a body baked with
 * its own light and wrong for a Lambert mesh that needs its normals. */
function mergeLit(sources: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color", "uv"]) {
    const size = sources[0].getAttribute(name).itemSize;
    let count = 0;
    for (const geo of sources) count += geo.getAttribute(name).count;
    const merged = new Float32Array(count * size);
    let at = 0;
    for (const geo of sources) {
      const attr = geo.getAttribute(name);
      merged.set(attr.array as ArrayLike<number>, at);
      at += attr.count * size;
    }
    out.setAttribute(name, new THREE.Float32BufferAttribute(merged, size));
  }
  for (const geo of sources) geo.dispose();
  return out;
}

/** A board on a post, standing on the ground at its foot, facing `-z`
 * in its own frame — turned by `heading` so it faces back down the way
 * the reader comes from. The group's origin is its middle, the way the
 * cone field wants a prop it can tumble. */
function board(
  b: GeoBuilder,
  post: { w: number; h: number },
  face: { w: number; h: number },
  texture: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  const total = post.h;
  const stake = new THREE.BoxGeometry(post.w, post.h, post.w);
  stake.translate(0, post.h / 2 - total / 2, 0);
  b.add(stake, TINT.post);
  group.add(new THREE.Mesh(b.build(), builtMaterial()));
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(face.w, face.h),
    new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff, side: THREE.DoubleSide }),
  );
  plate.position.set(0, post.h - face.h / 2 - 0.05 - total / 2, -post.w / 2 - 0.01);
  plate.rotation.y = Math.PI;
  group.add(plate);
  return group;
}

/** The strip of trodden earth from the pad to a stand, on the ground. */
function buildTrail(
  samples: readonly { x: number; z: number }[],
  heightAt: (x: number, z: number) => number,
): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const half = P.trail.width / 2;
  // Resampled finer than the engine's own step, so the strip lies on the
  // ground between two samples as well as at them.
  const points: { x: number; z: number }[] = [];
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / TRAIL.step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  points.push(samples[samples.length - 1]);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const heading = Math.atan2(next.x - prev.x, next.z - prev.z);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    for (const side of [-1, 1]) {
      const x = p.x + rx * half * side;
      const z = p.z + rz * half * side;
      positions.push(x, heightAt(x, z) + TRAIL.lift, z);
    }
    if (i > 0) {
      const k = i * 2;
      indices.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, trailMaterial());
}

export function buildCarPark(
  track: Track,
  park: CarPark,
  cones: ConeField,
  beside: GroundBeside,
): THREE.Group {
  const group = new THREE.Group();
  // Deterministic per car park: the facet jitter comes off the stage's
  // seed and the park's arc position, so a chunk rebuilt on an endless run
  // draws the same cars.
  const rng = createRng((track.seed ^ 0x5c31a9e7 ^ Math.round(park.atS)) >>> 0);
  const rand = () => rng.next();

  // The lane in: a hair under the road it leaves where the two overlap at
  // the mouth, with its skirt hanging from its own lip.
  const { road, pad } = park;
  group.add(buildSkirts(track, road.samples, road.width, 0.012, beside));
  group.add(buildRoad(track, road.samples, road.width, 0.012, beside));

  // The pad: a disc on the plane the terrain graded, tilted with it.
  const disc = new THREE.CircleGeometry(pad.radius, 32);
  disc.rotateX(-Math.PI / 2);
  const uv = disc.getAttribute("uv") as THREE.BufferAttribute;
  const pos = disc.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pad.x + pos.getX(i)) / 3.5, (pad.z + pos.getZ(i)) / 3.5);
    pos.setY(i, pad.grade.x * pos.getX(i) + pad.grade.z * pos.getZ(i));
  }
  disc.computeVertexNormals();
  const ground = new THREE.Mesh(disc, padMaterial());
  ground.position.set(pad.x, pad.y + PAD_LIFT, pad.z);
  group.add(ground);

  // The bays: a whitewashed line down each side of every bay and along the
  // back of each row, laid on the pad's plane.
  const lines = new GeoBuilder(rand);
  const bays = parkBays(park);
  const fx = Math.sin(park.heading);
  const fz = Math.cos(park.heading);
  const rx = Math.cos(park.heading);
  const rz = -Math.sin(park.heading);
  const paint = (cx: number, cz: number, along: number, across: number, heading: number): void => {
    const line = new THREE.BoxGeometry(across, 0.02, along);
    line.rotateY(heading);
    line.translate(cx, padHeight(pad, cx, cz) + PAD_LIFT + LINE.lift, cz);
    lines.add(line, TINT.line);
  };
  for (const bay of bays) {
    // The side lines: half a pitch either side of the bay's centre, the
    // bay's depth long, running out from the aisle.
    for (const side of [-1, 1]) {
      const sx = bay.x + fx * side * (P.bays.pitch / 2);
      const sz = bay.z + fz * side * (P.bays.pitch / 2);
      paint(sx, sz, P.bays.depth, LINE.width, bay.heading);
    }
  }
  for (const row of [-1, 1] as const) {
    const { length } = bayLayoutOf(park.bays);
    const back = P.bays.aisle / 2 + P.bays.depth;
    const bx = pad.x + rx * back * row;
    const bz = pad.z + rz * back * row;
    paint(bx, bz, length, LINE.width, park.heading);
  }
  group.add(new THREE.Mesh(lines.build(), builtMaterial()));

  // The cars: every one its own boxes from its own roll, merged into one
  // mesh — a car park of twenty-odd is twenty-odd draw calls otherwise.
  const geos: THREE.BufferGeometry[] = [];
  for (const car of park.cars) {
    const geo = parkedCarGeometry(parkedCarSpec(car.roll), rand);
    geo.rotateY(car.heading);
    geo.translate(car.x, car.y + PAD_LIFT, car.z);
    geos.push(geo);
  }
  if (geos.length > 0) group.add(new THREE.Mesh(mergeLit(geos), builtMaterial()));

  // The trails, and the boards along them.
  for (const trail of park.trails) {
    group.add(buildTrail(trail.samples, beside.heightAt));
    for (const sign of trail.signs) group.add(plantSign(sign, park.atS, cones, rand, beside));
  }

  // The P at the gate: beside the lane where it leaves the road it came off
  // — or, on a lane of its own, a little way in from the edge of the map.
  const gateAt = road.samples[Math.min(road.samples.length - 1, park.access === "map" ? 8 : 3)];
  const gr = { x: Math.cos(gateAt.heading), z: -Math.sin(gateAt.heading) };
  const gx = gateAt.x + gr.x * (road.width / 2 + 1.2);
  const gz = gateAt.z + gr.z * (road.width / 2 + 1.2);
  const gate = board(
    new GeoBuilder(rand),
    GATE.post,
    { w: GATE.board, h: GATE.board },
    parkingSignTexture(),
  );
  gate.position.set(gx, beside.heightAt(gx, gz) + GATE.post.h / 2, gz);
  // Facing the cars arriving: the lane's samples run IN, and a board turned
  // to the lane's heading looks back down it at what is coming.
  gate.rotation.y = gateAt.heading;
  group.add(gate);
  cones.plantProp(gate, park.atS, { reach: 0.35, height: GATE.post.h, rest: 0.35 });
  return group;
}

/** One arrow board, beside the trail, facing the walker coming up from the
 * pad, and handed to the cone field so a car can put it over. */
function plantSign(
  sign: TrailSign,
  atS: number,
  cones: ConeField,
  rand: () => number,
  beside: GroundBeside,
): THREE.Group {
  const post = board(new GeoBuilder(rand), SIGN.post, SIGN.board, trailSignTexture());
  post.position.set(sign.x, beside.heightAt(sign.x, sign.z) + SIGN.post.h / 2, sign.z);
  // The board's face looks back down the trail at the walker coming up
  // it, square across the path; the arrow on it points up, which on a
  // board you are walking toward is straight on.
  post.rotation.y = sign.heading;
  cones.plantProp(post, atS, { reach: 0.4, height: SIGN.post.h, rest: 0.4 });
  return post;
}

/** The bay rows' length for a count — restated from the engine's layout so
 * the back line is exactly as long as the row it closes. */
function bayLayoutOf(bays: number): { length: number } {
  return { length: Math.ceil(bays / 2) * P.bays.pitch };
}
