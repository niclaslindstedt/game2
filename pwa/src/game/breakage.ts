// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS LEFT OF WHAT THE CAR HIT. The engine decides that a trunk snapped
// or a stone came off its bed (collision.ts), takes it out of the terrain
// field so nothing collides with it or draws it standing again, and says so
// with a `solidBreak` carrying the velocity it gave the piece. This module
// is the other half: it stands a stand-in where the thing was, throws it
// along that velocity, and tumbles it (tumble.ts) until it lies still.
//
// The stand-in is cruder than the thing it replaces — a snapped bole for a
// tree, a lump for a stone. What the eye checks in the second it is airborne
// is that something the right size and colour went the way the car sent it;
// nobody counts the needles on a spruce cartwheeling past the window.
//
// What it checks AFTERWARDS is a different question, and the one that is
// easy to miss: the piece is still lying on that hillside for as long as the
// player can see it. So a trunk goes over the way it was pushed and comes to
// rest LYING DOWN (tumble.ts's `lays`) — a bole that settles upright is a
// bare pole growing out of the ground, and one that settles at an angle is a
// log hanging in the air. Both are what a wood the car has been through
// should never look like.

import * as THREE from "three";
import { isWooden, type SolidKind, type WildObstacle } from "@engine";

import { CUT_WOOD_COLOR, GeoBuilder } from "./flora-build.ts";
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
/** ...and the spin a STANDING trunk gets whatever it was hit at, rad/s,
 * about the axis that takes its top over the way the car pushed it. A tree
 * that is merely nudged off its stump still has to fall over: a quarter
 * turn in about a second is a tree going down, and without it a trunk clipped
 * at walking pace sinks straight down through its own footprint. */
const TOPPLE = 2.4;

type Piece = { body: TumbleBody; mesh: THREE.Mesh };

export type Breakage = {
  group: THREE.Group;
  /** Send the piece the car just broke on its way. */
  spawn: (solid: WildObstacle, vx: number, vy: number, vz: number) => void;
  update: (dt: number, groundAt: (x: number, z: number) => number) => void;
  dispose: () => void;
};

/** The pieces the car breaks off the landscape: `bark` colours anything
 * wooden, `stone` anything the ground made — the biome's own bedrock, so a
 * broken outcrop matches the rock it came out of. */
export function createBreakage(bark: number, stone: number): Breakage {
  const group = new THREE.Group();
  // A rough lump, shared by every stone that comes loose. The wooden pieces
  // get a geometry each instead (`boleGeo`): they are metres long, they end
  // up lying still in the grass where the player can look at them, and a
  // stretched cylinder has nothing on it to say which end broke.
  const lumpGeo = new THREE.DodecahedronGeometry(1);
  const barkColor = new THREE.Color(bark);
  const splinter = new THREE.Color(CUT_WOOD_COLOR);
  const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const stoneMat = new THREE.MeshLambertMaterial({ color: stone });
  let pieces: Piece[] = [];

  /** A snapped bole, centered on its own middle so it tumbles about its
   * waist: bark, the pale splintered break at the top, and the stubs of the
   * two lowest boughs. Built at true size — nothing here is scaled. */
  const boleGeo = (bole: number, long: number): THREE.BufferGeometry => {
    const b = new GeoBuilder(Math.random);
    b.cyl(barkColor, bole * 0.82, bole * 1.15, long, 0, {}, 6);
    b.cone(splinter, bole * 0.8, bole * 2.2, long - bole * 0.5, {}, 5);
    b.cyl(barkColor, bole * 0.16, bole * 0.32, long * 0.2, long * 0.52, {
      x: bole * 0.7,
      tiltZ: -1.15,
    });
    b.cyl(barkColor, bole * 0.14, bole * 0.28, long * 0.16, long * 0.72, {
      x: -bole * 0.6,
      ry: 1.9,
      tiltZ: 1.2,
    });
    const geo = b.build();
    geo.translate(0, -long / 2, 0);
    return geo;
  };

  const retire = (piece: Piece): void => {
    group.remove(piece.mesh);
    // The stone lump is shared by every piece that ever comes off a rock;
    // only the boles are this piece's own to free.
    if (piece.mesh.geometry !== lumpGeo) piece.mesh.geometry.dispose();
  };

  const spawn = (solid: WildObstacle, vx: number, vy: number, vz: number): void => {
    const wooden = isWooden(solid.kind);
    // The BOLE of a tree, not its canopy: what falls is the trunk the car
    // met, and a felled trunk lying in the grass is a trunk, not a shrub.
    const bole = solid.kind === "tree" ? solid.radius * 0.45 : solid.radius;
    const long = LYING.has(solid.kind) ? solid.radius * 2 : solid.height;
    const mesh = new THREE.Mesh(
      wooden ? boleGeo(bole, long) : lumpGeo,
      wooden ? barkMat : stoneMat,
    );
    if (!wooden) mesh.scale.set(solid.radius, solid.height * 0.7, solid.radius * 0.85);
    // A standing trunk goes over from where it stood; a lump leaves from
    // its own middle.
    mesh.position.set(solid.x, solid.y + (wooden ? long / 2 : solid.height * 0.35), solid.z);
    mesh.rotation.set(0, solid.spin, LYING.has(solid.kind) ? Math.PI / 2 : 0);
    group.add(mesh);
    const speed = Math.hypot(vx, vy, vz);
    // A standing trunk is pushed over the way the car was going: a spin
    // about the horizontal axis across that direction takes its top with it.
    const flat = Math.hypot(vx, vz) || 1;
    const over = wooden && !LYING.has(solid.kind) ? TOPPLE : 0;
    pieces.push({
      mesh,
      body: tumbleFrom(
        mesh,
        new THREE.Vector3(vx, vy, vz),
        new THREE.Vector3(
          (vz / flat) * over + (Math.random() - 0.5) * speed * SPIN,
          (Math.random() - 0.5) * speed * SPIN * 0.4,
          (-vx / flat) * over + (Math.random() - 0.5) * speed * SPIN,
        ),
        // Where the piece's own origin ends up once it is lying down: a
        // trunk on its side rests on its radius, a lump on its half-height.
        wooden ? bole : solid.height * 0.35,
        // ...and a trunk has to actually BE on its side by then.
        wooden,
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
    lumpGeo.dispose();
    barkMat.dispose();
    stoneMat.dispose();
  };

  return { group, spawn, update, dispose };
}
