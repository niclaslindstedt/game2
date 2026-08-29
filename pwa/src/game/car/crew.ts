// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEOPLE IN THE CAR. car-crew.ts says who they are; this builds them.
//
// Everything here is fitted to the one fact the cabin imposes: what a window
// shows is a tray about 300 mm deep between the body's own deck and the
// roof, and a helmet is 290 mm across. There is no room to be tall in. So a
// character is NOT a scaled body — the differences that fit are the ones
// that read anyway:
//
//   ACROSS. Shoulder width and girth have the whole cabin to spend and cost
//   nothing vertically. Granite is half again as wide as Birch, and that
//   survives a tinted pane at a car's length when nothing else does.
//
//   THE HEAD. Its size, how far it clears the shoulders, and how far forward
//   it leans. A big head sunk into wide shoulders and a small one up a long
//   neck are two different people seen from directly behind.
//
//   WHAT IS ON IT. A helmet is the brightest thing in the cabin, and hair
//   around one doubles the head's outline — so this is where the caricature
//   actually lands: a full lid, an open one with a mop out of it, a flat cap,
//   or nothing but a bouffant.
//
// The roof is a hard limit and it is enforced rather than authored around:
// the same character sits in a tall hatch and a low coupe, and the coupe has
// 260 mm to give.
//
// It all goes into the cabin's own builder, so a crew is triangles in a mesh
// that already exists and never a draw call of its own — the field draws
// fifteen cabins.

import * as THREE from "three";

import type { CrewCharacter } from "../car-crew.ts";
import { MeshBuilder, blob, slab, solid, tube, type V3 } from "./builder.ts";

/** Where a seat is, in car-local metres — everything a person is built from.
 * Handed in by car/interior.ts, which owns the cabin's proportions. */
export type CrewSeat = {
  /** The seat's centreline, m from the car's own. */
  x: number;
  /** The seat hinge along the car, m. */
  z: number;
  /** The cabin floor pan: the bottom of everything. */
  panY: number;
  /** The window sill — below it a body is inside a closed shell. */
  sillY: number;
  /** The headliner. Nothing may come through it. */
  roofY: number;
};

/** What the hands are doing, which is the whole difference between the two
 * seats: one drives and one reads. The driver's wheel is handed in because
 * the wheel's own placement belongs to the cabin, not to the person. */
export type CrewPose = { hands: "wheel"; wheel: { y: number; z: number } } | { hands: "book" };

/** The standard adult, sat in a bucket seat, m. Every character multiplies
 * these. */
const BODY = {
  /** Shoulder width, and how deep the chest is. */
  width: 0.38,
  depth: 0.26,
  /** How far the shoulder line clears the sill. */
  shoulderRise: 0.02,
  /** The bare skull, and the lid over it. */
  skull: 0.118,
  helmet: 0.142,
  /** The gap between the shoulders and the head. */
  neck: 0.022,
  /** How far a radian of lean carries the head forward. */
  leanReach: 0.09,
  /** Forearm thickness. */
  arm: 0.045,
  /** How far above the head's centre the LID reaches: the helmet blob's own
   * squash, plus the lift an open dome sits at over the skull inside it. */
  lidRise: 1.06,
  domeLift: 0.08,
};

/** How far above the head's centre each hairstyle reaches, in skull radii —
 * what the roof has to have room for. Kept beside the styles rather than
 * measured off them: the shapes are authored by eye and this is the one
 * number about them that is load-bearing. */
const HAIR_RISE: Record<CrewCharacter["hair"], number> = {
  none: 0,
  crop: 1.05,
  mop: 1.4,
  bouffant: 1.85,
  afro: 1.85,
  mane: 1.35,
  mullet: 1.1,
  bun: 1.55,
  tuft: 0.62,
};

/** The visor, and the goggles under an open lid. Dark enough to read as a
 * hole in a bright helmet from any angle, which is what says a helmet is
 * facing you. */
const VISOR = 0x1b2027;

/** The road book in the map reader's hands: pale pages, bound in the crew's
 * own trim colour — at this size a book is a band of colour, and the band is
 * doing more work than the book. */
const PAGES = 0xd8d2c0;

/** A person, resolved: where their head ended up, how wide they came out,
 * and the scale everything on the head is drawn against. */
type Build = {
  headY: number;
  headZ: number;
  shoulderY: number;
  torsoZ: number;
  width: number;
  depth: number;
  /** Bare skull radius, m, and the helmet over it. */
  skull: number;
  helmet: number;
};

function proportions(seat: CrewSeat, c: CrewCharacter): Build {
  const skull = BODY.skull * c.head;
  const helmet = BODY.helmet * c.head;
  const shoulderY = seat.sillY + BODY.shoulderRise + (c.stature - 1) * 0.06 + (c.girth - 1) * 0.035;
  return {
    // Clamped under the headliner: a character authored to sit tall sits as
    // tall as the car lets them, and no taller. The clamp is against the LID
    // and not against the hair — a bouffant tall enough to push the head down
    // would take the face below the window line, where the whole point of it
    // is lost. Hair is fitted to whatever room is left instead.
    headY: Math.min(
      shoulderY + BODY.neck * c.neck + helmet * 0.62,
      seat.roofY - helmet * BODY.lidRise - skull * BODY.domeLift - 0.006,
    ),
    headZ: seat.z + 0.02 + BODY.leanReach * c.lean,
    shoulderY,
    torsoZ: seat.z + 0.02 + BODY.leanReach * c.lean * 0.4,
    width: BODY.width * c.shoulders * (1 + (c.girth - 1) * 0.22),
    depth: BODY.depth * (1 + (c.girth - 1) * 0.35),
    skull,
    helmet,
  };
}

/** A dome: the top of a sphere, open underneath. An open-face helmet and a
 * flat cap are both this, and both are drawn over a head that fills the hole
 * they leave — an open primitive's missing faces are culled, so what sits
 * under one has to close it. */
function dome(
  b: MeshBuilder,
  at: V3,
  radius: number,
  color: number,
  segments: number,
  sweep = 0.62,
): void {
  const geo = new THREE.SphereGeometry(
    radius,
    segments,
    Math.max(2, Math.round(segments / 2)),
    0,
    Math.PI * 2,
    0,
    Math.PI * sweep,
  );
  solid(b, geo.translate(at[0], at[1], at[2]), color);
}

/** Shoulders and chest, with the swell of a big one. Below the sill this is
 * inside a closed body and nobody outside will ever see it; it is built down
 * to the pan anyway, because the hood camera and god mode's free camera both
 * sit INSIDE the cabin, where a torso that stops at the sill is a floating
 * pair of shoulders. */
function buildTorso(
  b: MeshBuilder,
  seat: CrewSeat,
  c: CrewCharacter,
  build: Build,
  high: boolean,
): void {
  const top = build.shoulderY + 0.02;
  const mid = (top + seat.panY) / 2;
  slab(
    b,
    [build.width, top - seat.panY, build.depth],
    [seat.x, mid, build.torsoZ],
    c.colors.suit,
    c.lean * 0.5,
  );
  if (!high) return;
  // The shoulders proper, and the stripe over them: the one part of the gear
  // that is not the overall's own colour, and the reason two crews in the
  // same dark suit are two crews.
  for (const side of [-1, 1]) {
    const x = seat.x + side * (build.width / 2 - build.width * 0.1);
    blob(b, [x, top - 0.02, build.torsoZ], build.width * 0.17, [1, 0.85, 1.1], c.colors.suit, 6);
    slab(
      b,
      [build.width * 0.11, 0.02, build.depth * 0.68],
      [x, top + 0.006, build.torsoZ],
      c.colors.trim,
    );
  }
}

/** The neck — or the collar of a race suit under a full lid, which is what
 * that gap actually contains. Without it a long-necked character's head
 * floats: the clamp under the roof can pull a head a good centimetre off the
 * shoulders it was authored to sit on. */
function buildNeck(b: MeshBuilder, c: CrewCharacter, build: Build, x: number): void {
  const top = build.headY - build.skull * 0.6;
  const bottom = build.shoulderY - 0.03;
  if (top - bottom < 0.005) return;
  const bare = c.helmet !== "full";
  tube(
    b,
    [x, bottom, build.torsoZ],
    [x, top, build.headZ],
    build.skull * 0.36,
    bare ? c.colors.skin : c.colors.suit,
    5,
  );
}

/** The head, and whatever is on it. */
function buildHead(b: MeshBuilder, c: CrewCharacter, build: Build, x: number, high: boolean): void {
  const { headY, headZ, skull, helmet } = build;
  const seg = high ? 8 : 6;
  const { colors } = c;

  if (c.helmet === "full") {
    blob(b, [x, headY, headZ], helmet, [1, 1.04, 1.06], colors.helmet, seg);
    slab(
      b,
      [helmet * 1.34, helmet * 0.46, 0.03],
      [x, headY + helmet * 0.06, headZ + helmet * 0.9],
      VISOR,
      -0.1,
    );
    if (!high) return;
    // A stripe over the crown, and the chin bar under the visor: the two
    // details that separate a lid from a ball.
    slab(b, [helmet * 0.34, 0.05, helmet * 1.7], [x, headY + helmet * 0.8, headZ], colors.trim);
    slab(
      b,
      [helmet * 1.1, helmet * 0.4, helmet * 0.5],
      [x, headY - helmet * 0.64, headZ + helmet * 0.58],
      colors.helmet,
      -0.15,
    );
    return;
  }

  blob(b, [x, headY, headZ], skull, [1, 1.06, 1], colors.skin, seg);

  if (c.helmet === "open") {
    dome(b, [x, headY + skull * 0.06, headZ], helmet, colors.helmet, seg);
    // The peak, and the goggles under it — an open lid with nothing dark
    // across the eyes reads as a bald man in a bowl.
    slab(
      b,
      [helmet * 1.06, 0.02, helmet * 0.46],
      [x, headY + skull * 0.44, headZ + helmet * 0.74],
      colors.helmet,
      -0.12,
    );
    slab(
      b,
      [skull * 1.5, skull * 0.32, 0.02],
      [x, headY + skull * 0.06, headZ + skull * 0.92],
      VISOR,
      -0.08,
    );
    if (high) {
      slab(b, [helmet * 0.3, 0.02, helmet * 1.5], [x, headY + helmet * 0.78, headZ], colors.trim);
    }
  } else if (c.helmet === "cap") {
    dome(b, [x, headY + skull * 0.1, headZ], skull * 1.06, colors.helmet, seg, 0.42);
    slab(
      b,
      [skull * 1.5, 0.018, skull * 0.8],
      [x, headY + skull * 0.5, headZ + skull * 0.82],
      colors.helmet,
      -0.1,
    );
  }
}

/** The hair, by outline. Anything under a full lid is not drawn at all —
 * which is why the roster gives its big hair to the drivers wearing an open
 * one, a cap, or nothing. */
function buildHair(
  b: MeshBuilder,
  seat: CrewSeat,
  c: CrewCharacter,
  build: Build,
  x: number,
  high: boolean,
): void {
  if (c.helmet === "full" || c.hair === "none") return;
  const { headY, headZ, skull: r } = build;
  const seg = high ? 6 : 5;
  // Squashed against the headliner rather than cut off by it: the whole mass
  // scales about the head's own centre, so it keeps its WIDTH — which is what
  // a big hairstyle is read by — and loses only the height the car has not
  // got. A rally car with a bouffant in it is flattened against the roof, and
  // that is both the honest answer and the funnier one.
  const wanted = HAIR_RISE[c.hair] * r;
  const room = seat.roofY - 0.006 - headY;
  const fit = Math.max(0.45, Math.min(1, room / Math.max(wanted, 1e-4)));
  const puff = (at: V3, radius: number, scale: V3): void =>
    blob(
      b,
      [at[0], headY + (at[1] - headY) * fit, at[2]],
      radius,
      [scale[0], scale[1] * fit, scale[2]],
      c.colors.hair,
      seg,
    );
  const sides = (dx: number, dy: number, dz: number, radius: number, scale: V3): void => {
    for (const side of [-1, 1]) puff([x + side * dx, headY + dy, headZ + dz], radius, scale);
  };

  switch (c.hair) {
    case "crop":
      puff([x, headY + r * 0.2, headZ - r * 0.08], r * 1.04, [1, 0.82, 1]);
      break;
    case "mop":
      puff([x, headY + r * 0.24, headZ - r * 0.05], r * 1.16, [1.02, 0.92, 1.06]);
      sides(r * 0.82, -r * 0.18, -r * 0.1, r * 0.5, [0.7, 1.1, 1]);
      break;
    case "bouffant":
      // Piled UP and swept back, not forward: a mound centred over the crown
      // buries the face it is supposed to be framing.
      puff([x, headY + r * 0.72, headZ - r * 0.3], r * 1.1, [1.05, 1, 0.95]);
      puff([x, headY + r * 0.22, headZ - r * 0.24], r * 1.06, [1.02, 0.85, 1]);
      break;
    case "afro":
      puff([x, headY + r * 0.34, headZ - r * 0.1], r * 1.5, [1, 1, 1]);
      break;
    case "mane":
      puff([x, headY + r * 0.28, headZ - r * 0.1], r * 1.08, [1, 0.85, 1.05]);
      sides(r * 0.9, -r * 0.55, -r * 0.15, r * 0.62, [0.55, 1.5, 1]);
      break;
    case "mullet":
      puff([x, headY + r * 0.26, headZ - r * 0.05], r * 1.05, [1, 0.8, 1]);
      puff([x, headY - r * 0.35, headZ - r * 0.95], r * 0.72, [1.1, 1, 0.7]);
      break;
    case "bun":
      puff([x, headY + r * 0.22, headZ - r * 0.05], r * 1.04, [1, 0.8, 1]);
      puff([x, headY + r * 1.02, headZ - r * 0.28], r * 0.5, [1, 1, 1]);
      break;
    case "tuft":
      sides(r * 0.92, r * 0.05, -r * 0.05, r * 0.56, [0.8, 0.9, 1]);
      break;
  }
}

/** What is on the face. A moustache is two thirds of a caricature and costs
 * one box — but only on a head somebody can see. */
function buildFace(b: MeshBuilder, c: CrewCharacter, build: Build, x: number, high: boolean): void {
  if (c.helmet === "full" || !c.face || c.face === "none") return;
  const { headY, headZ, skull: r } = build;
  const hair = c.colors.hair;
  switch (c.face) {
    case "moustache":
      slab(b, [r * 0.86, r * 0.2, 0.035], [x, headY - r * 0.44, headZ + r * 0.86], hair, -0.05);
      break;
    case "beard":
      blob(
        b,
        [x, headY - r * 0.62, headZ + r * 0.28],
        r * 0.82,
        [0.95, 0.8, 0.95],
        hair,
        high ? 6 : 5,
      );
      break;
    case "chops":
      for (const side of [-1, 1]) {
        slab(
          b,
          [0.02, r * 0.8, r * 0.55],
          [x + side * r * 0.9, headY - r * 0.22, headZ + r * 0.12],
          hair,
        );
      }
      break;
  }
}

/** Two forearms from the shoulders to whatever the hands are on — the wheel,
 * or the road book. Without them a crew is two dummies sat upright. */
function buildArms(
  b: MeshBuilder,
  c: CrewCharacter,
  build: Build,
  x: number,
  target: { y: number; z: number },
  high: boolean,
): void {
  for (const side of [-1, 1]) {
    const hand: V3 = [x + side * build.width * 0.34, target.y, target.z - 0.04];
    tube(
      b,
      [x + side * build.width * 0.44, build.shoulderY - 0.05, build.torsoZ - 0.02],
      hand,
      BODY.arm,
      c.colors.suit,
      5,
    );
    // The glove takes the crew's trim colour: a pair of them on the wheel is
    // the crew's own colour at the one place inside the cabin the player's
    // own camera looks at for a whole stage.
    if (high) blob(b, hand, BODY.arm * 1.15, [1, 0.9, 1], c.colors.trim, 5);
  }
}

/** The road book, open in the map reader's hands. It is the whole reason the
 * second seat is not just a passenger: a pale rectangle held up at sill
 * height, where the side glass can actually show it. */
function buildRoadBook(
  b: MeshBuilder,
  seat: CrewSeat,
  c: CrewCharacter,
  build: Build,
  high: boolean,
): { y: number; z: number } {
  const y = Math.max(seat.sillY + 0.02, build.shoulderY - 0.04);
  const z = build.headZ + 0.15;
  slab(b, [0.2, 0.012, 0.15], [seat.x, y, z], PAGES, -0.85);
  if (high) slab(b, [0.21, 0.014, 0.05], [seat.x, y - 0.028, z - 0.045], c.colors.trim, -0.85);
  return { y: y + 0.01, z: z - 0.02 };
}

/** One person in one seat. Everything lands in `b`. */
export function buildCrewMember(
  b: MeshBuilder,
  seat: CrewSeat,
  character: CrewCharacter,
  pose: CrewPose,
  high: boolean,
): void {
  const build = proportions(seat, character);
  const x = seat.x;
  buildTorso(b, seat, character, build, high);
  buildNeck(b, character, build, x);
  buildHead(b, character, build, x, high);
  buildHair(b, seat, character, build, x, high);
  buildFace(b, character, build, x, high);
  const hands =
    pose.hands === "wheel" ? pose.wheel : buildRoadBook(b, seat, character, build, high);
  buildArms(b, character, build, x, hands, high);
}
