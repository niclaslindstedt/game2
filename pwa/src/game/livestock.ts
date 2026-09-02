// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIVESTOCK (R37): the cows and the sheep grazing the paddocks. The
// engine decided WHERE they may be — the fenced rectangle, how many, which
// kind (`Paddock`) — and nothing else about them, because nothing about an
// animal is a thing a car collides with or a run is scored on: where each
// one stands this second is the renderer's, on the renderer's own clock,
// like the birds.
//
// Built the crowd's way: one merged low-poly body per breed and pose, drawn
// as instanced meshes, every animal a matrix written each frame — and only
// the herds near the car do any work, because a cow two kilometres off
// standing still is a cow. Each animal wanders: it grazes for a while with
// its head down, stands and looks about, walks a few metres and grazes
// again, and it turns back when it reaches the fence. Nothing about the
// walk is clever; from a car at speed a herd reads as a herd if it is
// spread out, pointing different ways, and not all doing the same thing.
//
// The breeds are the country's: the red-and-white Swedish cattle (SRB) and
// the black-and-white Holstein, and a lowland sheep with a dark face.

import * as THREE from "three";
import { createRng, rectDistance, type Paddock, type Rng } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { box } from "./house.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

type Pose = "graze" | "stand";
type Breed = "srb" | "holstein" | "sheep";

/** One animal, resolved: where it is in its paddock, which way it faces,
 * and what it is doing. */
type Animal = {
  breed: Breed;
  x: number;
  z: number;
  heading: number;
  pose: Pose;
  /** Seconds left in the current doing. */
  left: number;
  walking: boolean;
  scale: number;
  /** Where in its own idle cycle it is, so a herd never moves in step. */
  phase: number;
  herd: number;
};

type Herd = {
  paddock: Paddock;
  ground: (x: number, z: number) => number;
};

/** How near the car a herd has to be to be animated, m. */
const LIVE_RANGE = 260;

/** How the animals move: walking pace, m/s, and how long each doing lasts. */
const BEHAVIOUR = {
  cow: {
    walk: 0.55,
    graze: { min: 6, max: 16 },
    stand: { min: 2, max: 7 },
    go: { min: 3, max: 8 },
  },
  sheep: {
    walk: 0.7,
    graze: { min: 4, max: 12 },
    stand: { min: 1.5, max: 5 },
    go: { min: 2, max: 6 },
  },
  /** How close to the fence an animal turns back, m. */
  margin: 2.2,
};

const TINT = {
  srb: new THREE.Color(0x8a4a2e),
  srbWhite: new THREE.Color(0xe9e2d2),
  holstein: new THREE.Color(0xe9e6dd),
  holsteinBlack: new THREE.Color(0x1f1d1c),
  muzzle: new THREE.Color(0xc9a89a),
  hoof: new THREE.Color(0x2c2622),
  horn: new THREE.Color(0xd9cfb8),
  udder: new THREE.Color(0xe3b7a8),
  fleece: new THREE.Color(0xe6e0cf),
  sheepFace: new THREE.Color(0x2e2a28),
};

const material = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** A cow, standing on y = 0 facing +z: a deep body on four legs, the neck
 * and head forward, the head down at the grass in the grazing pose. The
 * hide is the breed's: SRB red with a white belly and blaze, Holstein
 * white with black patches laid on as proud facets. */
function cowGeometry(breed: Breed, pose: Pose, rng: Rng): THREE.BufferGeometry {
  const b = new GeoBuilder(() => rng.next());
  const hide = breed === "holstein" ? TINT.holstein : TINT.srb;
  const patch = breed === "holstein" ? TINT.holsteinBlack : TINT.srbWhite;
  const bodyY = 1.05;
  // The barrel, the chest a little deeper than the loin, the rump.
  box(b, hide, 0, bodyY, 0, 0.66, 0.72, 1.55);
  box(b, hide, 0, bodyY - 0.08, 0.35, 0.7, 0.62, 0.7);
  box(b, hide, 0, bodyY + 0.02, -0.72, 0.6, 0.6, 0.35);
  // The belly, and the patches: the belly white on the red breed, three or
  // four black patches on the flanks of the other.
  if (breed === "srb") {
    box(b, patch, 0, bodyY - 0.32, -0.05, 0.6, 0.12, 1.3);
  } else {
    for (let k = 0; k < 4; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const z = -0.6 + rng.range(0, 1.2);
      const h = rng.range(0.25, 0.5);
      const w = rng.range(0.3, 0.6);
      box(b, patch, side * 0.34, bodyY + rng.range(-0.15, 0.2), z, 0.02, h, w);
    }
    box(
      b,
      patch,
      0,
      bodyY + 0.37,
      rng.range(-0.5, 0.4),
      rng.range(0.3, 0.6),
      0.02,
      rng.range(0.3, 0.7),
    );
  }
  // The legs, with a dark hoof each.
  for (const side of [-1, 1]) {
    for (const z of [0.5, -0.55]) {
      const leg = new THREE.CylinderGeometry(0.07, 0.06, 0.72, 6);
      leg.translate(side * 0.22, 0.36, z);
      b.add(leg, hide);
      box(b, TINT.hoof, side * 0.22, 0.05, z, 0.15, 0.1, 0.16);
    }
  }
  // The neck and head: forward and level standing, down to the grass
  // grazing.
  const down = pose === "graze";
  const neckTilt = down ? -0.95 : -0.25;
  const neck = new THREE.BoxGeometry(0.3, 0.32, 0.55);
  neck.translate(0, 0, 0.27);
  neck.rotateX(neckTilt);
  neck.translate(0, bodyY + 0.12, 0.72);
  b.add(neck, hide);
  const headY = down ? 0.55 : bodyY + 0.22;
  const headZ = down ? 1.05 : 1.2;
  box(b, hide, 0, headY, headZ, 0.28, 0.32, 0.5);
  box(b, TINT.muzzle, 0, headY - 0.06, headZ + 0.26, 0.24, 0.2, 0.08);
  if (breed === "srb") box(b, patch, 0, headY + 0.02, headZ + 0.2, 0.1, 0.24, 0.12);
  for (const side of [-1, 1]) {
    box(b, hide, side * 0.2, headY + 0.1, headZ - 0.1, 0.14, 0.06, 0.1);
    const horn = new THREE.ConeGeometry(0.03, 0.16, 5);
    horn.rotateZ(side * 0.9);
    horn.translate(side * 0.16, headY + 0.2, headZ - 0.16);
    b.add(horn, TINT.horn);
  }
  // The udder and the tail.
  box(b, TINT.udder, 0, bodyY - 0.42, -0.3, 0.3, 0.16, 0.34);
  box(b, hide, 0, bodyY - 0.15, -0.94, 0.06, 0.55, 0.06);
  return b.build();
}

/** A sheep: a fleece blob on four thin dark legs, a dark face. */
function sheepGeometry(pose: Pose, rng: Rng): THREE.BufferGeometry {
  const b = new GeoBuilder(() => rng.next());
  const bodyY = 0.62;
  const fleece = new THREE.IcosahedronGeometry(0.5, 1);
  fleece.scale(0.9, 0.8, 1.15);
  fleece.translate(0, bodyY, 0);
  b.add(fleece, TINT.fleece);
  for (const side of [-1, 1]) {
    for (const z of [0.28, -0.3]) {
      const leg = new THREE.CylinderGeometry(0.04, 0.035, 0.42, 5);
      leg.translate(side * 0.16, 0.21, z);
      b.add(leg, TINT.sheepFace);
    }
  }
  const down = pose === "graze";
  const headY = down ? 0.3 : bodyY + 0.12;
  const headZ = down ? 0.62 : 0.68;
  box(b, TINT.sheepFace, 0, headY, headZ, 0.18, 0.22, 0.3);
  for (const side of [-1, 1])
    box(b, TINT.sheepFace, side * 0.12, headY + 0.08, headZ - 0.05, 0.1, 0.04, 0.06);
  return b.build();
}

export type Livestock = {
  group: THREE.Group;
  /** Take a paddock's herd into the world. */
  add: (paddock: Paddock, ground: (x: number, z: number) => number, seed: number) => void;
  /** Advance the herds near the car. */
  update: (dt: number, focusX: number, focusZ: number) => void;
  dispose: () => void;
};

/** One instanced body: a breed in a pose. */
type Body = {
  breed: Breed;
  pose: Pose;
  geo: THREE.BufferGeometry;
  mesh: THREE.InstancedMesh | null;
};

export function createLivestock(): Livestock {
  const group = new THREE.Group();
  const herds: Herd[] = [];
  const animals: Animal[] = [];
  const rng = createRng(0x5a1d7e33);
  const bodies: Body[] = [];
  for (const breed of ["srb", "holstein", "sheep"] as const) {
    for (const pose of ["graze", "stand"] as const) {
      const geo = breed === "sheep" ? sheepGeometry(pose, rng) : cowGeometry(breed, pose, rng);
      bodies.push({ breed, pose, geo, mesh: null });
    }
  }
  let dirty = false;
  const live: boolean[] = [];

  const add = (paddock: Paddock, ground: (x: number, z: number) => number, seed: number): void => {
    const herd = herds.length;
    herds.push({ paddock, ground });
    live.push(true);
    const r = createRng(
      (seed ^ 0x33c1a7d9 ^ Math.round(paddock.rect.x * 7 + paddock.rect.z * 3)) >>> 0,
    );
    const { rect } = paddock;
    // One breed per herd, the way a farm keeps one.
    const breed: Breed =
      paddock.stock === "sheep" ? "sheep" : paddock.roll < 0.55 ? "srb" : "holstein";
    const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
    const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
    // Bunched: a herd grazes together, in a loose knot somewhere in the
    // paddock rather than spread evenly over it.
    const knotU = r.range(-rect.depth * 0.25, rect.depth * 0.25);
    const knotV = r.range(-rect.width * 0.3, rect.width * 0.3);
    const spread = breed === "sheep" ? 7 : 10;
    for (let i = 0; i < paddock.head; i++) {
      const u = Math.max(
        -rect.depth / 2 + 3,
        Math.min(rect.depth / 2 - 3, knotU + r.range(-spread, spread)),
      );
      const v = Math.max(
        -rect.width / 2 + 3,
        Math.min(rect.width / 2 - 3, knotV + r.range(-spread, spread)),
      );
      animals.push({
        breed,
        x: rect.x + right.x * u + fwd.x * v,
        z: rect.z + right.z * u + fwd.z * v,
        heading: r.range(0, Math.PI * 2),
        pose: r.chance(0.7) ? "graze" : "stand",
        left: r.range(2, 10),
        walking: false,
        scale: r.range(0.9, 1.08) * (breed === "sheep" ? 1 : 1),
        phase: r.range(0, Math.PI * 2),
        herd,
      });
    }
    dirty = true;
  };

  /** (Re)allocate the instanced meshes to the animals now in the world. */
  const rebuild = (): void => {
    for (const body of bodies) {
      if (body.mesh) {
        group.remove(body.mesh);
        body.mesh.dispose();
        body.mesh = null;
      }
      const count = animals.filter((a) => a.breed === body.breed).length;
      if (count === 0) continue;
      const mesh = new THREE.InstancedMesh(body.geo, material(), count);
      mesh.frustumCulled = false;
      body.mesh = mesh;
      group.add(mesh);
    }
    dirty = false;
    live.fill(true);
    place();
  };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const gone = new THREE.Matrix4().makeScale(0, 0, 0);
  let clock = 0;

  /** Write every live animal's matrix into the mesh of its pose, and a
   * collapsed one into the other pose's — an instance nobody writes sits
   * at the world origin, which is the start line. */
  const place = (): void => {
    const cursor = new Map<Breed, number>();
    for (const a of animals) {
      const n = cursor.get(a.breed) ?? 0;
      cursor.set(a.breed, n + 1);
      if (!live[a.herd]) continue;
      for (const body of bodies) {
        if (body.breed !== a.breed || !body.mesh) continue;
        if (body.pose !== a.pose) {
          body.mesh.setMatrixAt(n, gone);
          continue;
        }
        const y = herds[a.herd].ground(a.x, a.z);
        // A little rock on the feet while it grazes, a bob while it walks.
        const bob = a.walking ? Math.abs(Math.sin(clock * 6 + a.phase)) * 0.04 : 0;
        pos.set(a.x, y + bob, a.z);
        q.setFromAxisAngle(up, a.heading);
        scale.set(a.scale, a.scale, a.scale);
        m.compose(pos, q, scale);
        body.mesh.setMatrixAt(n, m);
      }
    }
    for (const body of bodies) if (body.mesh) body.mesh.instanceMatrix.needsUpdate = true;
  };

  const wander = (a: Animal, dt: number): void => {
    const kind = a.breed === "sheep" ? BEHAVIOUR.sheep : BEHAVIOUR.cow;
    const { rect } = herds[a.herd].paddock;
    a.left -= dt;
    if (a.left <= 0) {
      // The next doing: mostly graze, sometimes stand, sometimes go.
      const roll = rng.next();
      if (roll < 0.5) {
        a.pose = "graze";
        a.walking = false;
        a.left = rng.range(kind.graze.min, kind.graze.max);
      } else if (roll < 0.72) {
        a.pose = "stand";
        a.walking = false;
        a.left = rng.range(kind.stand.min, kind.stand.max);
        a.heading += rng.range(-0.6, 0.6);
      } else {
        a.pose = "stand";
        a.walking = true;
        a.left = rng.range(kind.go.min, kind.go.max);
        a.heading += rng.range(-1.2, 1.2);
      }
    }
    if (!a.walking) return;
    const nx = a.x + Math.sin(a.heading) * kind.walk * dt;
    const nz = a.z + Math.cos(a.heading) * kind.walk * dt;
    // The fence: turn back before it, toward the paddock's middle.
    if (rectDistance(rect, nx, nz) > -BEHAVIOUR.margin) {
      a.heading = Math.atan2(rect.x - a.x, rect.z - a.z) + rng.range(-0.5, 0.5);
      return;
    }
    a.x = nx;
    a.z = nz;
  };

  const update = (dt: number, focusX: number, focusZ: number): void => {
    if (dirty) rebuild();
    if (animals.length === 0) return;
    clock += dt;
    let any = false;
    for (let i = 0; i < herds.length; i++) {
      const { rect } = herds[i].paddock;
      live[i] = Math.hypot(rect.x - focusX, rect.z - focusZ) < LIVE_RANGE + rect.width / 2;
      any = any || live[i];
    }
    if (!any) return;
    for (const a of animals) if (live[a.herd]) wander(a, dt);
    place();
  };

  const dispose = (): void => {
    for (const body of bodies) {
      body.geo.dispose();
      if (body.mesh) {
        group.remove(body.mesh);
        body.mesh.dispose();
      }
    }
  };

  return { group, add, update, dispose };
}
