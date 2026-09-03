// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAINING GROUND, DRAWN — the paint on it and the things standing on
// it.
//
// The GROUND is not here. The arena's pad, its graded roads, its ramp and
// the bank round the lot are terrain: the engine's field says what shape
// they are and `terrain.ts` draws them, at the arena's own finer lattice,
// out of the road's own palette. That is deliberate — the car drives on
// them, so they have to be the surface the physics reads and not a mesh
// laid over one.
//
// What is left is everything the ground is not: the marks painted on it,
// the containers and barriers and tyre walls standing on it, and the cones
// laid out over the whole of it. All of it comes off the engine's plan
// (`mapgen/arena.ts`), so the circle a car drifts round and the circle it
// is drawn round are one radius, and a tyre wall stops the car exactly
// where it looks like it does.
//
// It is its own manager outside the road chunks, for the wind farms'
// reason: the arena is two hundred metres wide and belongs to no slice of a
// hundred-metre approach road.

import * as THREE from "three";
import type { ArenaMarking, ArenaPlan, ArenaStructure } from "@engine";

import type { ConeField } from "./cones.ts";

/** How far over the ground the paint sits, m. Enough to beat the depth
 * buffer at the far end of a two-hundred-metre pad, little enough that
 * nothing casts a shadow off it. */
const PAINT_LIFT = 0.035;
/** How long a piece a painted shape is cut into, m — the paint follows the
 * ground, and the ground under it is a graded road's crown as often as it
 * is a flat pad. */
const PAINT_STEP = 4;

const PAINT = { white: "#e8e6df", yellow: "#e8b52c" } as const;

/** The colours the yard is built out of. A service yard is not dressed: it
 * is a working ground, and everything on it is the colour that thing comes
 * in. */
const LOOK = {
  container: ["#8a5a3c", "#3f6b78", "#7a7f74"],
  barrier: "#b3aea1",
  tyre: "#22242a",
  kerbRed: "#c0392b",
  kerbWhite: "#e8e6df",
  post: "#7a6a4e",
  rail: "#8a7a5c",
} as const;

export type Arena = {
  group: THREE.Group;
  dispose: () => void;
};

/** Build the training ground's dressing, and lay its cones out in `cones`.
 *
 * `groundAt` is the DRAWN ground — the same surface the terrain tiles put
 * under the wheels — because everything here stands on what is drawn, never
 * on the analytic field between two of its corners. */
export function createArena(
  plan: ArenaPlan,
  groundAt: (x: number, z: number) => number,
  cones: ConeField,
): Arena {
  const group = new THREE.Group();
  const dispose: (() => void)[] = [];

  const keep = <T extends THREE.BufferGeometry | THREE.Material>(thing: T): T => {
    dispose.push(() => thing.dispose());
    return thing;
  };

  group.add(buildMarkings(plan.markings, groundAt, keep));
  group.add(buildStructures(plan.structures, groundAt, keep));
  for (const cone of plan.cones) {
    cones.plant(cone.x, groundAt(cone.x, cone.z), cone.z, 0, cone.tall);
  }

  return {
    group,
    dispose: () => {
      for (const d of dispose) d();
    },
  };
}

type Keep = <T extends THREE.BufferGeometry | THREE.Material>(thing: T) => T;

/** THE PAINT, as one mesh. Every mark on the ground is a ribbon of quads
 * cut short enough to follow whatever the ground is doing under it, and all
 * of them share one buffer: a couple of hundred marks is a couple of
 * hundred draw calls otherwise, for a thing that is two triangles wide. */
function buildMarkings(
  markings: ArenaMarking[],
  groundAt: (x: number, z: number) => number,
  keep: Keep,
): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const tone = new THREE.Color();

  /** One straight piece of paint, from a to b, `width` across. */
  const stripe = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    width: number,
    color: THREE.Color,
  ): void => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    // The mark's own right axis, half a width out either side.
    const nx = (dz / len) * (width / 2);
    const nz = (-dx / len) * (width / 2);
    const corner = (x: number, z: number): void => {
      positions.push(x, groundAt(x, z) + PAINT_LIFT, z);
      colors.push(color.r, color.g, color.b);
    };
    // Wound so both triangles face UP. Get this backwards and the whole of
    // the paint is culled by a front-facing material and the ground simply
    // has no marks on it — silently, because a back-facing mesh draws
    // nothing rather than drawing wrong. The ground tiles and the water
    // sheet wind the same way for the same reason.
    corner(ax + nx, az + nz);
    corner(ax - nx, az - nz);
    corner(bx + nx, bz + nz);
    corner(bx + nx, bz + nz);
    corner(ax - nx, az - nz);
    corner(bx - nx, bz - nz);
  };

  /** ...and a run of them along a line, so the paint sits on the ground
   * instead of spanning whatever the ground does between its ends. */
  const run = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    width: number,
    color: THREE.Color,
  ): void => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / PAINT_STEP));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      stripe(
        ax + (bx - ax) * t0,
        az + (bz - az) * t0,
        ax + (bx - ax) * t1,
        az + (bz - az) * t1,
        width,
        color,
      );
    }
  };

  for (const mark of markings) {
    tone.set(PAINT[mark.tone]);
    if (mark.kind === "line") {
      run(mark.x1, mark.z1, mark.x2, mark.z2, mark.width, tone);
      continue;
    }
    // A circle is the same run closed on itself, cut fine enough that the
    // arc reads as an arc from inside it — which is where it is read from.
    const steps = Math.max(24, Math.ceil((2 * Math.PI * mark.radius) / PAINT_STEP));
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      stripe(
        mark.x + Math.sin(a0) * mark.radius,
        mark.z + Math.cos(a0) * mark.radius,
        mark.x + Math.sin(a1) * mark.radius,
        mark.z + Math.cos(a1) * mark.radius,
        mark.width,
        tone,
      );
    }
  }

  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    keep(
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        // Paint is on the ground, not over it: without this the mark
        // z-fights the tile it is lying on at the far end of the pad.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    ),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** Everything BUILT on the ground, one merged mesh per kind. */
function buildStructures(
  structures: ArenaStructure[],
  groundAt: (x: number, z: number) => number,
  keep: Keep,
): THREE.Group {
  const group = new THREE.Group();
  for (const s of structures) {
    const built =
      s.kind === "container"
        ? container(s, keep)
        : s.kind === "barrier"
          ? runOfBoxes(s, 2.4, LOOK.barrier, keep)
          : s.kind === "tyres"
            ? tyreWall(s, keep)
            : s.kind === "kerb"
              ? kerbRun(s, keep)
              : fence(s, keep);
    built.position.set(s.x, groundAt(s.x, s.z), s.z);
    built.rotation.y = s.angle;
    group.add(built);
  }
  return group;
}

/** A shipping container: a box, its long ribs, and the pair of doors on one
 * end. Everything the yard has for a building. */
function container(s: ArenaStructure, keep: Keep): THREE.Object3D {
  const out = new THREE.Group();
  const colour = LOOK.container[Math.abs(Math.round(s.x + s.z)) % LOOK.container.length];
  const body = new THREE.Mesh(
    keep(new THREE.BoxGeometry(s.width, s.height, s.length)),
    keep(new THREE.MeshLambertMaterial({ color: colour })),
  );
  body.position.y = s.height / 2;
  body.castShadow = true;
  out.add(body);
  // The doors: a slightly proud plate on one end, so the box has a front.
  const doors = new THREE.Mesh(
    keep(new THREE.BoxGeometry(s.width * 0.92, s.height * 0.88, 0.12)),
    keep(new THREE.MeshLambertMaterial({ color: "#2f3238" })),
  );
  doors.position.set(0, s.height / 2, s.length / 2 + 0.06);
  out.add(doors);
  return out;
}

/** A run of identical blocks down the structure's long axis — the concrete
 * barriers, and anything else that is a wall made of repeats. */
function runOfBoxes(s: ArenaStructure, bay: number, colour: string, keep: Keep): THREE.Object3D {
  const count = Math.max(1, Math.round(s.length / bay));
  const geo = keep(new THREE.BoxGeometry(s.width, s.height, bay * 0.94));
  const mesh = new THREE.InstancedMesh(
    geo,
    keep(new THREE.MeshLambertMaterial({ color: colour })),
    count,
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? 0 : (i / (count - 1) - 0.5) * s.length;
    m.makeTranslation(0, s.height / 2, along);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

/** A tyre wall: stacks of three, shoulder to shoulder down the run. Drawn
 * as flattened cylinders rather than tori — at the distance a tyre wall is
 * read from, the hole in the middle is one pixel and the ring costs eight
 * times the triangles. */
function tyreWall(s: ArenaStructure, keep: Keep): THREE.Object3D {
  const high = Math.max(1, Math.round(s.height / 0.4));
  const along = Math.max(1, Math.round(s.length / 1.6));
  const geo = keep(new THREE.CylinderGeometry(0.78, 0.78, 0.36, 10));
  const mesh = new THREE.InstancedMesh(
    geo,
    keep(new THREE.MeshLambertMaterial({ color: LOOK.tyre })),
    high * along,
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let a = 0; a < along; a++) {
    const at = along === 1 ? 0 : (a / (along - 1) - 0.5) * s.length;
    for (let h = 0; h < high; h++) {
      // Half a tyre of stagger per course, so the wall reads as stacked
      // rubber rather than as a striped box.
      m.makeTranslation((h % 2) * 0.12 - 0.06, 0.2 + h * 0.4, at);
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

/** A kerb: alternating red and white blocks, low and long. Two instanced
 * meshes rather than one, because the alternation IS the kerb — a kerb you
 * cannot see the rhythm of is a kerb you cannot place the car against. */
function kerbRun(s: ArenaStructure, keep: Keep): THREE.Object3D {
  const out = new THREE.Group();
  const bay = 0.9;
  const count = Math.max(2, Math.round(s.length / bay));
  const geo = keep(new THREE.BoxGeometry(s.width, s.height, bay));
  for (const [colour, parity] of [
    [LOOK.kerbRed, 0],
    [LOOK.kerbWhite, 1],
  ] as const) {
    const n = Math.ceil((count - parity) / 2);
    if (n <= 0) continue;
    const mesh = new THREE.InstancedMesh(
      geo,
      keep(new THREE.MeshLambertMaterial({ color: colour })),
      n,
    );
    const m = new THREE.Matrix4();
    let i = 0;
    for (let k = parity; k < count; k += 2) {
      m.makeTranslation(0, s.height / 2, (k / (count - 1) - 0.5) * s.length);
      mesh.setMatrixAt(i++, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    out.add(mesh);
  }
  return out;
}

/** A fence: posts down the run with two rails between them. */
function fence(s: ArenaStructure, keep: Keep): THREE.Object3D {
  const out = new THREE.Group();
  const bay = 3;
  const count = Math.max(2, Math.round(s.length / bay));
  const posts = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(0.12, s.height, 0.12)),
    keep(new THREE.MeshLambertMaterial({ color: LOOK.post })),
    count,
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(0, s.height / 2, (i / (count - 1) - 0.5) * s.length);
    posts.setMatrixAt(i, m);
  }
  posts.instanceMatrix.needsUpdate = true;
  out.add(posts);
  for (const at of [0.45, 0.85]) {
    const rail = new THREE.Mesh(
      keep(new THREE.BoxGeometry(0.06, 0.1, s.length)),
      keep(new THREE.MeshLambertMaterial({ color: LOOK.rail })),
    );
    rail.position.y = s.height * at;
    out.add(rail);
  }
  return out;
}
