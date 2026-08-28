// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS LEFT OF WHAT THE CAR HIT. The engine decides that a trunk snapped
// or a stone came off its bed (collision.ts), takes it out of the terrain
// field so nothing collides with it or draws it standing again, and says so
// with a `solidBreak` carrying the velocity it gave the piece. This module
// is the other half: it stands a stand-in where the thing was, throws it
// along that velocity, and tumbles it (tumble.ts) until it lies still.
//
// The stand-in is deliberately cruder than the thing it replaces — a bole
// for a tree, a lump for a stone. What the eye checks in the second it is
// airborne is that something the right size and colour went the way the car
// sent it and landed on the ground; nobody counts the branches on a spruce
// that is cartwheeling past the window.

import * as THREE from "three";
import { isWooden, type SolidKind, type WildObstacle } from "@engine";

import { stepTumble, tumbleFrom, type TumbleBody } from "./tumble.ts";

/** The kinds that already lie DOWN in the world — a fallen trunk, one still
 * holding its root plate, a stack of cut timber. Their long axis is the
 * collision circle they cover, not the height they stand to, so the
 * stand-in has to be laid over the same way or a log takes off vertically. */
const LYING = new Set<SolidKind>(["log", "rootlog", "timber"]);

/** How many pieces are kept in the air at once. Past it the oldest is
 * retired: a stage-long drive through the forest must not accumulate a
 * mesh per trunk it went through. */
const MAX_PIECES = 24;
/** Spin a piece leaves with, rad/s per m/s of the speed it left at. A
 * snapped trunk goes end over end; a stone rolls. */
const SPIN = 0.5;

type Piece = { body: TumbleBody; mesh: THREE.Mesh };

export type Breakage = {
  group: THREE.Group;
  /** Send the piece the car just broke on its way. */
  spawn: (solid: WildObstacle, vx: number, vy: number, vz: number) => void;
  update: (dt: number, groundAt: (x: number, z: number) => number) => void;
  dispose: () => void;
};

/** The pieces the car breaks off the landscape, drawn from two shapes and
 * two colours: `bark` for anything wooden, `stone` for anything the ground
 * made — the biome's own bedrock, so a broken outcrop matches the rock it
 * came out of. */
export function createBreakage(bark: number, stone: number): Breakage {
  const group = new THREE.Group();
  // A six-sided bole and a rough lump: the same vocabulary the flora and
  // the wild's stone are drawn in, at the same polygon budget.
  const trunkGeo = new THREE.CylinderGeometry(1, 1.15, 1, 6);
  const lumpGeo = new THREE.DodecahedronGeometry(1);
  const barkMat = new THREE.MeshLambertMaterial({ color: bark });
  const stoneMat = new THREE.MeshLambertMaterial({ color: stone });
  let pieces: Piece[] = [];

  const retire = (piece: Piece): void => {
    group.remove(piece.mesh);
    piece.mesh.geometry.dispose();
  };

  const spawn = (solid: WildObstacle, vx: number, vy: number, vz: number): void => {
    const wooden = isWooden(solid.kind);
    const mesh = new THREE.Mesh(wooden ? trunkGeo : lumpGeo, wooden ? barkMat : stoneMat);
    // The BOLE of a tree, not its canopy: what falls is the trunk the car
    // met, and a felled trunk lying in the grass is a trunk, not a shrub.
    const bole = solid.kind === "tree" ? solid.radius * 0.45 : solid.radius;
    const long = LYING.has(solid.kind) ? solid.radius * 2 : solid.height;
    if (wooden) mesh.scale.set(bole, long, bole);
    else mesh.scale.set(solid.radius, solid.height * 0.7, solid.radius * 0.85);
    // A standing trunk goes over from where it stood; a lump leaves from
    // its own middle.
    mesh.position.set(solid.x, solid.y + (wooden ? long / 2 : solid.height * 0.35), solid.z);
    mesh.rotation.set(0, solid.spin, LYING.has(solid.kind) ? Math.PI / 2 : 0);
    group.add(mesh);
    const speed = Math.hypot(vx, vy, vz);
    pieces.push({
      mesh,
      body: tumbleFrom(
        mesh,
        new THREE.Vector3(vx, vy, vz),
        new THREE.Vector3(
          (Math.random() - 0.5) * speed * SPIN,
          (Math.random() - 0.5) * speed * SPIN * 0.4,
          (Math.random() - 0.5) * speed * SPIN,
        ),
        // Where the piece's own origin ends up once it is lying down: a
        // trunk on its side rests on its radius, a lump on its half-height.
        wooden ? bole : solid.height * 0.35,
      ),
    });
    while (pieces.length > MAX_PIECES) retire(pieces.shift() as Piece);
  };

  const update = (dt: number, groundAt: (x: number, z: number) => number): void => {
    for (const piece of pieces) stepTumble(piece.body, dt, groundAt);
  };

  const dispose = (): void => {
    for (const piece of pieces) retire(piece);
    pieces = [];
    trunkGeo.dispose();
    lumpGeo.dispose();
    barkMat.dispose();
    stoneMat.dispose();
  };

  return { group, spawn, update, dispose };
}
