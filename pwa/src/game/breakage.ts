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
// THE RIGHT SIZE is the whole of that, and it is not the solid's collision
// circle. A circle says how much ground a thing covers, not how much wood is
// in it: a fallen log's circle is the LENGTH of the log, and a standing
// tree's is the trunk plus the boughs around it and never comes below 0.3 m
// however small the tree. Cut a piece to `solid.radius` and a log leaves a
// barrel five metres across, a sapling leaves a mature trunk, and the thing
// the player has been looking at for the last second is replaced by
// something else entirely. `boleOf` is where that is settled, off the wood
// flora-species.ts actually draws.
//
// What it checks AFTERWARDS is a different question, and the one that is
// easy to miss: the piece is still lying on that hillside for as long as the
// player can see it. So a trunk goes over the way it was pushed and comes to
// rest LYING DOWN (tumble.ts's `lays`) — a bole that settles upright is a
// bare pole growing out of the ground, and one that settles at an angle is a
// log hanging in the air. Both are what a wood the car has been through
// should never look like.

import * as THREE from "three";
import { isWooden, type WildObstacle } from "@engine";

import { CUT_WOOD_COLOR, GeoBuilder } from "./flora-build.ts";
import { stepTumble, tumbleFrom, type TumbleBody } from "./tumble.ts";

/** A drawn trunk's radius at the foot, m per unit of the solid's `size` —
 * the middle of the range flora-species.ts builds across the species a
 * stage plants (a young spruce is 0.15 there, a Scots pine 0.34, an old
 * spruce 0.40). Deliberately NOT taken from the tree's collision circle:
 * that circle is the trunk plus the lowest boughs and it never comes below
 * 0.3 m however small the tree, so a stand-in cut to it drops a mature
 * trunk out of a sapling. */
const TRUNK_RADIUS = 0.24;
/** ...and how much of a standing tree's height comes away as the bole. The
 * canopy is not part of the piece — what lies in the grass afterwards is a
 * trunk, not a tree — and the share is what keeps the piece a TRUNK at
 * every size: thickness and length both scale with the tree, so a small one
 * drops a small log instead of a whip. */
const BOLE_SHARE = 0.6;

/** THE WOOD IN A SOLID: how thick the piece that comes off it is (radius,
 * m), how long, and whether the thing was already lying down when the car
 * arrived. Every number is the wood flora-species.ts actually draws for
 * that kind, because a collision circle is not a trunk — a fallen log's
 * circle is the LENGTH it covers, so a stand-in cut to `solid.radius` is a
 * barrel five metres across where a log should be. */
function boleOf(solid: WildObstacle): { thick: number; long: number; lying: boolean } {
  const { kind, size, radius, height } = solid;
  switch (kind) {
    case "log":
      // `fallenLog` — a trunk lying down. Here the engine's own height IS
      // the thickness of the bole, and its circle the length it covers.
      return { thick: height / 2, long: radius * 2, lying: true };
    case "rootlog":
      // `rootLog` — the same trunk, but its height is the root PLATE
      // standing on end rather than the bole, so the wood is measured off
      // its own drawn radius (the one solids.ts weighs it by).
      return { thick: 0.32 * size, long: radius * 2, lying: true };
    case "timber":
      // One log off the stack, not the stack: `logPile` builds its courses
      // at a quarter-metre radius.
      return { thick: 0.25 * size, long: radius * 2, lying: true };
    case "stump":
      // A cut bole is nothing BUT wood — the collision circle is the trunk.
      return { thick: radius, long: height, lying: false };
    default:
      return { thick: TRUNK_RADIUS * size, long: height * BOLE_SHARE, lying: false };
  }
}

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

const UP = new THREE.Vector3(0, 1, 0);
/** Scratch for the bearing a lying piece is laid along. */
const laid = new THREE.Vector3();

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

  /** One bough stub, leaned out from its OWN base on the trunk. GeoBuilder
   * turns a part about the model's origin rather than about itself, so a
   * stub asked for at half the trunk's height with a `tiltZ` on it does not
   * lean off the trunk — it is thrown half a trunk's length out into the
   * grass, and the piece is suddenly as wide as it is long. */
  const bough = (
    b: GeoBuilder,
    bole: number,
    long: number,
    at: number,
    out: number,
    lean: number,
    ry: number,
  ): void => {
    const geo = new THREE.CylinderGeometry(bole * 0.5, bole, long, 5);
    geo.translate(0, long / 2, 0);
    geo.rotateZ(lean);
    geo.translate(out, at, 0);
    b.add(geo, barkColor, { ry });
  };

  /** A snapped bole, centered on its own middle so it tumbles about its
   * waist: bark, the pale splintered break at the top, and — on a trunk
   * that was STANDING until the car arrived — the stubs of its two lowest
   * boughs. A trunk that was already down has none, because the thing it
   * replaces has none: a log that has lain there long enough to grow moss
   * lost its branches to the same years, and two of them a metre long is
   * most of what makes a piece read as bigger than the log it came from.
   * Built at true size — nothing here is scaled. */
  const boleGeo = (bole: number, long: number, boughs: boolean): THREE.BufferGeometry => {
    const b = new GeoBuilder(Math.random);
    b.cyl(barkColor, bole * 0.82, bole * 1.15, long, 0, {}, 6);
    // The splintered break, as long as the wood is thick — but never longer
    // than a third of the piece it is on, or a short stubby bole (a kicked
    // stump) comes away wearing a dunce's cap taller than itself.
    b.cone(splinter, bole * 0.8, Math.min(bole * 2.2, long * 0.35), long - bole * 0.5, {}, 5);
    if (boughs) {
      bough(b, bole * 0.32, long * 0.2, long * 0.52, bole * 0.7, -1.15, 0);
      bough(b, bole * 0.28, long * 0.16, long * 0.72, -bole * 0.6, 1.2, 1.9);
    }
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
    const { thick, long, lying } = boleOf(solid);
    const mesh = new THREE.Mesh(
      wooden ? boleGeo(thick, long, !lying) : lumpGeo,
      wooden ? barkMat : stoneMat,
    );
    if (!wooden) mesh.scale.set(solid.radius, solid.height * 0.7, solid.radius * 0.85);
    // A standing trunk goes over from where it stood; a lump leaves from
    // its own middle; and one that was ALREADY down leaves from where it
    // lay, which is one bole-radius over the ground and not half a trunk
    // up in the air.
    const lift = lying ? thick : long / 2;
    mesh.position.set(solid.x, solid.y + (wooden ? lift : solid.height * 0.35), solid.z);
    // ...and along the same LINE the prop was drawn on. For a fallen trunk
    // the engine's `spin` is a compass bearing rather than a free yaw (it
    // puts a blown-over tree down the fall line), and planting.ts turns it
    // into the yaw each model is authored for — so a piece that took it as
    // a plain yaw swings round at the moment it comes loose.
    if (lying)
      mesh.quaternion.setFromUnitVectors(
        UP,
        laid.set(Math.cos(solid.spin), 0, Math.sin(solid.spin)),
      );
    else mesh.rotation.set(0, solid.spin, 0);
    group.add(mesh);
    const speed = Math.hypot(vx, vy, vz);
    // A standing trunk is pushed over the way the car was going: a spin
    // about the horizontal axis across that direction takes its top with it.
    const flat = Math.hypot(vx, vz) || 1;
    const over = wooden && !lying ? TOPPLE : 0;
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
        wooden ? thick : solid.height * 0.35,
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
