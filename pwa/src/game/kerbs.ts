// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R26 — THE MARKING, as objects in the world.
//
// The engine decides WHERE (engine/mapgen/kerbs.ts owns the placement guide
// AND the marker list it becomes); this module decides what stands there,
// and the answer depends entirely on what the road is made of:
//
//   ASPHALT gets a kerb. A low, continuous concrete edging laid along the
//   road, striped along its length — the thing a car can put two wheels on
//   and feel. It runs through the whole zone, because that is how a kerb is
//   laid, and it is a SURFACE rather than an object, which is why it is the
//   one piece of marking this module still places for itself.
//
//   GRAVEL gets POSTS, and at an apex a row of anti-cut BLOCKS. They are
//   DISCRETE — a run of objects with country between them, which is the
//   whole visual difference from a painted band and the reason a gravel
//   stage reads as a road with a rally on it rather than as a circuit.
//
// The two discrete kinds part company at the contact model. A BLOCK is
// solid: the engine collides the car with the same list drawn here, so the
// slab that throws a cut apex is a slab the player can see. A POST stops
// nothing and never reaches the physics at all — it is knocked flat here,
// like a cone, off the same body box the engine would have used.
//
// Everything here is instanced: a stage's worth of posts is hundreds of
// identical little objects, and hundreds of draw calls for them is the
// cheapest possible way to lose a frame budget. A post that has been
// knocked over is still one of those instances — its matrix is written from
// a tumbling proxy every frame rather than promoted to a mesh of its own.

import * as THREE from "three";
import {
  KERB_MARKER,
  buildKerbs,
  corridorOffset,
  roleAt,
  type GameState,
  type KerbMarker,
  type Track,
} from "@engine";

import { shareOne } from "../lib/shared-gpu.ts";
import type { Ribbon } from "./ribbon.ts";
import { rightOf } from "./ribbon.ts";
import { drivingThrough, outOfBody, stepTumble, tumbleFrom, type TumbleBody } from "./tumble.ts";

/** The marking's two colours, everywhere they appear.
 *
 * ORANGE rather than the rally red the real thing is painted in, and the
 * reason is what the colour SAYS at 140 km/h. Red is this game's colour for
 * something having gone wrong — the tape across a closed branch, the damage
 * instrument, the marker on the map — so a corner lined in it reads as a
 * reprimand for a line the player has not even taken yet. Orange is a
 * marshal pointing rather than a marshal shouting: the same "here is the
 * edge" against green verge and brown gravel alike, and the same colour the
 * cones beside the jumps already are. */
const ORANGE = "#ef7a1e";
const WHITE = "#f6f3ea";

const POST = KERB_MARKER.post;
const BLOCK = KERB_MARKER.block;

/** The asphalt kerb: how far out from the road edge it starts, how wide it
 * is, and how proud of the mat it stands. Low profile on purpose — this is
 * a country road's edging, not a circuit's sawtooth. */
const KERB = { width: 0.62, lift: 0.07 };
/** ...and how long one stripe of it runs, meters. */
const STRIPE = 1.6;

// ── The shared shapes ─────────────────────────────────────────────────────
// One geometry and one material per kind for the whole world: every chunk
// of road draws the same little box, and a chunk being dropped must not
// free the shape the road still standing is drawn from.

const warnMaterial = shareOne(() => new THREE.MeshLambertMaterial({ color: ORANGE }));
const whiteMaterial = shareOne(() => new THREE.MeshLambertMaterial({ color: WHITE }));

/** A post: a plain square stake. The white band is a face split rather than
 * a texture — one more box would double the instance count for a stripe
 * nobody reads past twenty metres. */
const postGeometry = shareOne(
  () => new THREE.BoxGeometry(POST.width, POST.height, POST.width) as THREE.BufferGeometry,
);
const blockGeometry = shareOne(
  () => new THREE.BoxGeometry(BLOCK.width, BLOCK.height, BLOCK.depth) as THREE.BufferGeometry,
);

/** Orange sides, white top: the top is what a driver sees of a post from a
 * car, and it is the only face worth a second colour. */
function postMaterials(): THREE.Material[] {
  const warn = warnMaterial();
  return [warn, warn, whiteMaterial(), warn, warn, warn];
}

/** A block is the other way round — white body, orange ends — because it is
 * seen from along the road rather than from above it. */
function blockMaterials(): THREE.Material[] {
  const warn = warnMaterial();
  const white = whiteMaterial();
  return [warn, warn, white, white, white, white];
}

/** What one kind of marker IS: the shape, the paint on its faces, and how
 * far its own origin sits over its foot. Every marker on every stage comes
 * out of here, so a shape is stated once — and the item sheet stands one up
 * on its own from the same three answers. */
export function markerShape(kind: KerbMarker["kind"]): {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  lift: number;
} {
  return kind === "post"
    ? { geometry: postGeometry(), materials: postMaterials(), lift: POST.height / 2 }
    : { geometry: blockGeometry(), materials: blockMaterials(), lift: BLOCK.height / 2 };
}

/** Stand a batch of markers of one kind up as a single instanced mesh, at
 * the poses the engine placed them at — each raised off its foot to
 * wherever its own origin sits (the middle of a stake, the middle of a
 * slab). */
function instance(kind: KerbMarker["kind"], markers: KerbMarker[]): THREE.InstancedMesh | null {
  if (markers.length === 0) return null;
  const { geometry, materials, lift } = markerShape(kind);
  const mesh = new THREE.InstancedMesh(geometry, materials, markers.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  markers.forEach((marker, i) => {
    q.setFromAxisAngle(up, marker.spin);
    m.compose(v.set(marker.x, marker.y + lift, marker.z), q, one);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

// ── The posts, and knocking them down ────────────────────────────────────

/** How far out the contact test grows the car's body box, m — a post is a
 * stake rather than a point, and a wheel brushing one still flattens it. */
const REACH = POST.width;
/** Below this the car is not driving through anything, m/s — without it a
 * post lying under a parked car is re-launched every frame. */
const KNOCK_FROM = 1.2;
/** Fraction of the car's speed a struck post leaves with. Under a cone's,
 * because a post is hammered into the ground and has to come out of it
 * before it can go anywhere. */
const KICK = 0.42;
/** …with this much of it as lift, plus a floor so a crawl still tips one. */
const LOFT = 0.12;
const LOFT_MIN = 1.1;
/** Cap on how fast a post leaves, m/s — past this it reads as a javelin. */
const KICK_MAX = 15;
/** How hard a struck post tumbles, rad/s per m/s of the speed it left at.
 * High, and mostly about the horizontal axes: what the eye is checking is
 * that the thing standing upright ends up FLAT, and it wants to see it go
 * over rather than find it lying there. */
const SPIN = 1.5;
/** Where a post's own origin sits over the ground once it is down, m — it
 * comes to rest on its side, so half a stake's width. */
const LYING = POST.width / 2;

type Post = {
  batch: THREE.InstancedMesh;
  index: number;
  /** Arc position on the stage, m — what the endless prune reads. */
  s: number;
  /** Where it stands, its own origin: the middle of the stake. */
  x: number;
  y: number;
  z: number;
  /** Null while it is still standing; the tumbling proxy once it is not.
   * The proxy is never in the scene — its matrix is copied into the batch's
   * instance, so a knocked post costs no draw call of its own. */
  body: TumbleBody | null;
};

export type PostField = {
  /** Stand a chunk's posts up as one instanced batch and take them under
   * management, so the car can flatten them later. The mesh is the
   * caller's to add to its chunk group; null where a chunk has no posts. */
  plant: (markers: KerbMarker[]) => THREE.InstancedMesh | null;
  /** Forget every post up to `s` — the chunk that drew them has gone. */
  retireBefore: (s: number) => void;
  /** Flatten whatever the car is driving through, and step what is
   * falling. `knocked` is raised once per post put over, with the speed it
   * left at: a post makes a noise, and the engine has never heard of one. */
  update: (state: GameState, dt: number, knocked?: (speed: number) => void) => void;
  dispose: () => void;
};

export function createPostField(): PostField {
  let posts: Post[] = [];
  /** Batches whose instance matrices this frame rewrote — reused rather
   * than rebuilt, because on the overwhelming majority of frames nothing
   * is falling and this stays empty. */
  const touched = new Set<THREE.InstancedMesh>();

  const plant = (markers: KerbMarker[]): THREE.InstancedMesh | null => {
    const batch = instance("post", markers);
    if (batch === null) return null;
    markers.forEach((marker, index) => {
      posts.push({
        batch,
        index,
        s: marker.s,
        x: marker.x,
        y: marker.y + POST.height / 2,
        z: marker.z,
        body: null,
      });
    });
    return batch;
  };

  /** Put one post over: out of the ground along the car's own travel,
   * pushed away from the flank that hit it so a clipped one spins off the
   * side rather than straight down the road. */
  const knock = (post: Post, state: GameState, outX: number, outZ: number): number => {
    const car = state.car;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const vx = sinH * car.u + cosH * car.w;
    const vz = cosH * car.u - sinH * car.w;
    const along = Math.hypot(vx, vz) || 1;
    const speed = Math.min(KICK_MAX, along * KICK);
    const push = Math.hypot(outX, outZ) || 1;
    const dirX = ((vx / along) * 2 + outX / push) / 3;
    const dirZ = ((vz / along) * 2 + outZ / push) / 3;
    const proxy = new THREE.Object3D();
    proxy.position.set(post.x, post.y, post.z);
    const body = tumbleFrom(
      proxy,
      new THREE.Vector3(dirX * speed, LOFT_MIN + speed * LOFT, dirZ * speed),
      // Tipped about the horizontal axes across the way it was hit, so it
      // goes over the way it was pushed instead of spinning on the spot.
      new THREE.Vector3(
        dirZ * SPIN + (Math.random() - 0.5) * SPIN,
        (Math.random() - 0.5) * SPIN * 0.4,
        -dirX * SPIN + (Math.random() - 0.5) * SPIN,
      ),
      LYING,
      // A stake is a LONG thing, so the tumbler lays it flat as it settles
      // rather than letting it sleep at whatever angle its energy ran out
      // at — one resting at twenty degrees reads as a post still standing,
      // which is the whole thing this is here to prevent.
      true,
    );
    post.body = body;
    return speed;
  };

  const update = (state: GameState, dt: number, knocked?: (speed: number) => void): void => {
    const car = state.car;
    const ground = state.terrain.groundAt;
    const driving = !car.airborne && Math.hypot(car.u, car.w) > KNOCK_FROM;
    touched.clear();

    for (const post of posts) {
      if (post.body === null) {
        if (!driving) continue;
        const hit = drivingThrough(car, post.x, post.y, post.z, REACH, POST.height);
        if (hit === null) continue;
        const out = outOfBody(car, hit, REACH);
        // The post goes over whether or not anybody is listening: an
        // optional call does not evaluate its arguments, so the knock
        // cannot live inside `knocked?.(…)`.
        const speed = knock(post, state, out.x, out.z);
        knocked?.(speed);
      }
      const body = post.body as TumbleBody;
      if (body.asleep) continue;
      stepTumble(body, dt, ground);
      body.object.updateMatrix();
      post.batch.setMatrixAt(post.index, body.object.matrix);
      touched.add(post.batch);
    }
    for (const batch of touched) batch.instanceMatrix.needsUpdate = true;
  };

  const retireBefore = (s: number): void => {
    posts = posts.filter((post) => post.s > s);
  };

  const dispose = (): void => {
    posts = [];
  };

  return { plant, retireBefore, update, dispose };
}

// ── Everything a chunk of road wears ─────────────────────────────────────

/**
 * The marking on one stretch of road.
 *
 * `samples` is the bare stage range (never the drawn apron — a marker post
 * standing on extrapolated road past the finish belongs to nothing), and
 * `markers` the engine's own list for exactly that stretch. The posts are
 * handed to `field` so the car can knock them flat; the blocks and the
 * sealed road's continuous kerb are scenery that stays where it is put.
 */
export function buildKerbing(
  track: Track,
  samples: Ribbon[],
  width: number,
  markers: KerbMarker[],
  field: PostField,
): THREE.Group {
  const group = new THREE.Group();
  const strip = buildStrip(track, samples, width);
  if (strip) group.add(strip);
  const posts = field.plant(markers.filter((m) => m.kind === "post"));
  if (posts) group.add(posts);
  const blocks = instance(
    "block",
    markers.filter((m) => m.kind === "block"),
  );
  if (blocks) group.add(blocks);
  return group;
}

/** THE SEALED ROAD'S OWN KERB: a continuous striped band laid along the
 * edge of the mat, built as one strip per side and broken wherever the
 * zone stops. Nothing discrete about it, which is why it is placed here off
 * the zones rather than off the engine's marker list. */
function buildStrip(track: Track, samples: Ribbon[], width: number): THREE.Mesh | null {
  if (samples.length === 0) return null;
  const zones = buildKerbs(track, samples[0].s, samples[samples.length - 1].s);
  if (zones.length === 0) return null;

  const half = width / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const warn = new THREE.Color(ORANGE);
  const white = new THREE.Color(WHITE);

  for (const side of [-1, 1] as const) {
    let start = 0;
    let run = 0;
    for (const s of samples) {
      // A ford and a bridge deck carry no edging of their own: the water
      // and the parapet are the markers there. Gravel is marked with the
      // discrete things above, and breaks the strip here or the next
      // sealed run welds itself onto whatever the last one was doing.
      if (s.surface !== "asphalt" || s.deck != null || roleAt(zones, s.s, side) === null) {
        start = positions.length / 3;
        run = 0;
        continue;
      }
      // The kerb's two edges ride the corridor's own profile, so a kerb on
      // a banked corner is banked with the road.
      const r = rightOf(s.heading);
      const inner = (half - KERB.width) * side;
      const outer = half * side;
      positions.push(
        s.x + r.x * inner,
        s.elevation + corridorOffset(s, inner, width) + KERB.lift,
        s.z + r.z * inner,
        s.x + r.x * outer,
        s.elevation + corridorOffset(s, outer, width) + KERB.lift,
        s.z + r.z * outer,
      );
      const tint = Math.floor(s.s / STRIPE) % 2 === 0 ? warn : white;
      colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      if (run > 0) {
        const a = start + (run - 1) * 2;
        if (side > 0) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      run += 1;
    }
  }

  if (indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
}
