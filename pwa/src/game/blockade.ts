// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE BLOCK ACROSS AN ABANDONED BRANCH: what a marshal puts in the
// mouth of the road the stage does not take.
//
// Two things had to change about it, and they are different problems with
// the same cause — nothing but the renderer knew where the block was.
//
// WHERE. It used to be placed here, at the first sample of the branch off
// the junction's own platform, and on a third of every sweep of seeds that
// put it square across the road the stage DOES take: a branch leaves along
// the main road's tangent and the route turns off it, so for the first
// stretch the two carriageways are still one piece of ground. The place is
// the generator's now (`spurs.ts`, `placeBlock`), chosen so the whole line
// clears the route — and because it is the generator's, the analysis can
// measure it, which is the half that keeps it fixed.
//
// WHAT. A line of five cones and a strip of tape is a quiet thing to put in
// front of somebody at a hundred and forty. Rallies do not use quiet things
// for this: they use whatever the organisers had on the lorry, and it is
// always something you would rather not hit. So there are four kinds, rolled
// per branch — cones, stacks of scrap tyres, round bales off the field next
// to the junction, and empty oil drums — and every one of them still carries
// the chevron board, because the board is the half that says WHICH WAY the
// stage goes rather than merely which way it does not.
//
// None of it is solid. The tape is a statement, not a wall: a player who
// wants to know where the branch goes drives through it, scatters it, and
// finds out. Every loose piece goes into the cone field, which knocks and
// tumbles them all on the same terms (cones.ts).

import * as THREE from "three";
import { type RoadBlock } from "@engine";

import { type ConeField, type PropShape } from "./cones.ts";
import { rightOf } from "./ribbon.ts";
import { chevronTexture } from "./textures.ts";

/** A scrap tyre: the ring, and how the stacks are built out of it. */
const TYRE = { radius: 0.33, tube: 0.13, stack: { min: 2, max: 4 }, gap: 0.22 };
/** A round bale, on its side across the road. */
const BALE = { radius: 0.62, length: 1.2 };
/** An empty oil drum. */
const DRUM = { radius: 0.28, height: 0.86 };

/** How many pieces stand across the road, per kind. The line has to LOOK
 * shut from the throat of the junction, which is a different bar from being
 * shut: five cones read as a suggestion and five stacks of tyres read as a
 * wall, so the count falls as the piece gets bigger. */
const ACROSS = { cones: 5, tyres: 4, bales: 3, drums: 5 };

/** Colours. Rally scrap: black rubber, weathered straw, and drums in the
 * blue and rust of every yard that ever had one. */
const PAINT = {
  tyre: 0x24242a,
  bale: 0xcaa85e,
  baleEnd: 0xb08f47,
  drum: [0x2f5f9e, 0x8d4a2a, 0x3f7048],
  post: "#f6f3ea",
  tape: "#e23c2c",
};

/** Shared geometry — one blockade per junction and a handful of junctions
 * per stage, but the pieces repeat inside every one of them, so building
 * these once per module beats building forty per stage. */
let shapes: {
  tyre: THREE.TorusGeometry;
  bale: THREE.CylinderGeometry;
  drum: THREE.CylinderGeometry;
} | null = null;

function geometry(): NonNullable<typeof shapes> {
  if (shapes) return shapes;
  const tyre = new THREE.TorusGeometry(TYRE.radius, TYRE.tube, 5, 9);
  // Laid flat: a torus is built standing in the XY plane and a tyre in a
  // stack lies in the XZ one.
  tyre.rotateX(Math.PI / 2);
  shapes = {
    tyre,
    bale: new THREE.CylinderGeometry(BALE.radius, BALE.radius, BALE.length, 10, 1),
    drum: new THREE.CylinderGeometry(DRUM.radius, DRUM.radius, DRUM.height, 10, 1),
  };
  return shapes;
}

/** Deterministic per block and slot — the same barrier every time the chunk
 * is built, which an endless run does more than once. */
function roll(block: RoadBlock, slot: number, salt: number): number {
  const v =
    Math.sin(block.x * 12.9898 + block.z * 78.233 + slot * 37.719 + salt * 4.1414) * 43758.5;
  return v - Math.floor(v);
}

/** One stack of tyres, as a group standing on the ground at the origin. */
function tyreStack(count: number, spin: number, mat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const geo = geometry().tyre;
  for (let k = 0; k < count; k++) {
    const ring = new THREE.Mesh(geo, mat);
    ring.position.y = TYRE.tube + k * TYRE.gap;
    // Each tyre in a stack sits a little off the one under it — a stack
    // nobody straightened is what makes it scrap rather than a display.
    ring.rotation.y = spin + k * 0.7;
    ring.position.x = Math.sin(spin + k * 2.1) * 0.05;
    ring.position.z = Math.cos(spin + k * 1.7) * 0.05;
    group.add(ring);
  }
  return group;
}

/** Build the barrier a branch is shut with, and hand its loose pieces to
 * the cone field so the car can scatter them. Everything is positioned in
 * world space: the group is added to a road chunk and never moved. */
export function buildBlockade(block: RoadBlock, cones: ConeField): THREE.Group {
  const group = new THREE.Group();
  const r = rightOf(block.heading);
  const postMat = new THREE.MeshLambertMaterial({ color: PAINT.post });
  const tapeMat = new THREE.MeshLambertMaterial({ color: PAINT.tape });
  const half = block.width / 2;

  // ── The line itself. Spread across the carriageway with the outer pieces
  // just inside the edge, so the barrier reads as belonging to the road it
  // shuts rather than as litter that landed near it.
  const n = ACROSS[block.kind];
  const place = (slot: number): { x: number; z: number } => {
    const t = n === 1 ? 0 : (slot / (n - 1)) * 2 - 1;
    const lat = t * half * 0.82;
    return { x: block.x + r.x * lat, z: block.z + r.z * lat };
  };

  if (block.kind === "cones") {
    for (let k = 0; k < n; k++) {
      const at = place(k);
      cones.plant(at.x, block.y, at.z, block.s);
    }
  } else if (block.kind === "tyres") {
    const mat = new THREE.MeshLambertMaterial({ color: PAINT.tyre });
    for (let k = 0; k < n; k++) {
      const at = place(k);
      const count =
        TYRE.stack.min + Math.floor(roll(block, k, 1) * (TYRE.stack.max - TYRE.stack.min + 1));
      const stack = tyreStack(count, roll(block, k, 2) * Math.PI * 2, mat);
      const top = TYRE.tube + (count - 1) * TYRE.gap + TYRE.tube;
      // The group's own origin is its foot; the tumble body swings about
      // the object's centre, so it is placed at the stack's middle and the
      // rings are shifted down inside it by the same amount.
      stack.children.forEach((ring) => (ring.position.y -= top / 2));
      stack.position.set(at.x, block.y + top / 2, at.z);
      group.add(stack);
      cones.plantProp(stack, block.s, {
        reach: TYRE.radius + TYRE.tube,
        height: top,
        rest: TYRE.radius,
      });
    }
  } else if (block.kind === "bales") {
    const mat = new THREE.MeshLambertMaterial({ color: PAINT.bale });
    const endMat = new THREE.MeshLambertMaterial({ color: PAINT.baleEnd });
    for (let k = 0; k < n; k++) {
      const at = place(k);
      // Lying on its side with the round faces looking down the road: a
      // bale set across the carriageway is a bale somebody rolled there.
      const bale = new THREE.Mesh(geometry().bale, [mat, endMat, endMat]);
      bale.rotation.z = Math.PI / 2;
      bale.rotation.y = block.heading + (roll(block, k, 3) - 0.5) * 0.3;
      bale.position.set(at.x, block.y + BALE.radius, at.z);
      group.add(bale);
      cones.plantProp(bale, block.s, {
        reach: BALE.length / 2,
        height: BALE.radius * 2,
        rest: BALE.radius,
      });
    }
  } else {
    for (let k = 0; k < n; k++) {
      const at = place(k);
      const mat = new THREE.MeshLambertMaterial({
        color: PAINT.drum[Math.floor(roll(block, k, 4) * PAINT.drum.length) % PAINT.drum.length],
      });
      const drum = new THREE.Mesh(geometry().drum, mat);
      drum.rotation.y = roll(block, k, 5) * Math.PI;
      drum.position.set(at.x, block.y + DRUM.height / 2, at.z);
      group.add(drum);
      cones.plantProp(drum, block.s, {
        reach: DRUM.radius,
        height: DRUM.height,
        rest: DRUM.radius,
      });
    }
  }

  // ── ...and the tape between two posts, over whatever is standing under
  // it. The same on all four, because the tape is what makes a line of
  // objects a CLOSURE rather than a line of objects.
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), postMat);
    post.position.set(block.x + r.x * half * side, block.y + 0.8, block.z + r.z * half * side);
    group.add(post);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(block.width, 0.18, 0.06), tapeMat);
  tape.position.set(block.x, block.y + 1.25, block.z);
  tape.rotation.y = block.heading;
  group.add(tape);

  // ── The board: chevrons pointing back the way the stage actually goes.
  const chevrons = new THREE.MeshLambertMaterial({ map: chevronTexture(), color: 0xffffff });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.12), [
    postMat,
    postMat,
    postMat,
    postMat,
    chevrons,
    chevrons,
  ]);
  board.position.set(block.x, block.y + 1.9, block.z);
  board.rotation.y = block.heading;
  group.add(board);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), postMat);
    leg.position.set(block.x + r.x * side, block.y + 0.95, block.z + r.z * side);
    group.add(leg);
  }
  return group;
}

/** What a `PropShape` is, restated for the reader who arrived here first:
 * the contact footprint, the standing height and the resting height of one
 * loose piece. */
export type { PropShape };
