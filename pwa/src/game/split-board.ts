// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R28 — THE SPLIT BOARD, as a thing standing on the stage.
//
// A checkpoint is a line across the road that the clock is watching and a
// lost car is put back on, and the driver being timed through it has to be
// able to SEE it — a split the HUD announces a moment after the fact is a
// split that happened to somebody rather than one they drove at.
//
// So a pair of FLAGS, one each side, on the sample the gate is measured at.
// Two of them rather than one, because two make a GATE — a single flag is
// dressing beside the road, and a matched pair a hundred metres ahead is a
// line to drive through. They fly INWARD over the verge, which puts the
// cloth across the driver's view rather than edge-on to it, and hangs the
// bright half where the car is looking.
//
// YELLOW, and specifically the HUD's own signal yellow (`--hud-good`), for
// the reason the map picked it: the map's ring is what sends a lost driver
// here, and a mark that is one colour on the map and another on the stage
// is two marks. It is also nobody else's colour out here — the marking is
// orange (kerbs.ts), a closure is red (blockade.ts), a gate's banner is
// red and white.
//
// The flags stand just off the road EDGE, not at the ends of the gate the
// engine actually watches (`boardHalfWidth` — the road plus twelve metres).
// That gate is deliberately far wider than anyone driving the stage, so
// that a car crossing the line sideways with two wheels in the grass still
// counts; flags planted at its ends would be a pair of poles in the trees
// pointing at nothing. What the flags mark is the LINE.
//
// Nothing here is solid. A pole clipped on the way past goes over like a
// cone does — it is planted in the same field as every other loose thing
// beside this road (cones.ts), so it knocks, tumbles and lies where it
// falls. The gate it marks is a line in the engine and does not care.

import * as THREE from "three";
import { corridorOffset, createRng, type Checkpoint, type Track } from "@engine";

import { shareOne } from "../lib/shared-gpu.ts";
import type { ConeField } from "./cones.ts";
import { GeoBuilder } from "./flora-build.ts";
import { rightOf } from "./ribbon.ts";

/** How far outside the road's own edge a pole stands, m. Far enough to be
 * clear of a car putting two wheels on the verge, close enough that the
 * pair still reads as the two ends of one line. */
const OUT = 1.15;
/** How far the foot is buried, m — a pole set on a verge that is not quite
 * the surface the profile promises still stands in the ground. */
const SINK = 0.1;

/** The pole: tall enough to carry the cloth above a car's roof and be seen
 * over a crest, thin enough to read as a marker rather than a post. */
const POLE = { height: 3.1, top: 0.05, foot: 0.075, collar: 0.4 };

/** The flag: how far it reaches in over the verge, how deep it hangs at the
 * hoist, how much shallower the free edge is (cloth flown from one edge
 * narrows into the wind — a rectangle reads as a board), how far below the
 * pole's top it is hoisted, and how hard the wind has it: `wave` is the
 * depth of the curl along the road and `droop` how far the free corner
 * falls. Both are BAKED into the geometry rather than animated — a flag
 * frozen mid-curl reads as cloth at the speed one is passed at, and a
 * stage's worth of them then costs nothing per frame. */
const FLAG = {
  length: 1.7,
  drop: 0.85,
  taper: 0.26,
  hoist: 0.22,
  wave: 0.16,
  droop: 0.14,
};

const TINT = {
  pole: new THREE.Color(0x2b3038),
  /** The HUD's signal yellow, and the shade the cloth deepens to along its
   * bottom edge so a flat quad still has a top and a bottom. Both are
   * carried HIGH: the flag's face is near vertical and points down the road,
   * which is a grazing angle to a sun that is overhead, and a marker that
   * has to be read from two hundred metres cannot be lit like a rock. */
  flag: new THREE.Color(0xffe063),
  flagLow: new THREE.Color(0xfdc022),
};

/** Double-sided because a flag has a back, and the car sees it: the pair is
 * approached from one side and driven away from on the other. */
const boardMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
);

/** The cloth, in the assembly's own frame: hoisted at the pole and reaching
 * `-side` in x (which is in over the road), curling along z (down the road),
 * narrowing and drooping as it goes. */
function cloth(side: number, phase: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(FLAG.length, FLAG.drop, 5, 1);
  // A plane is built centred and facing +z; hang it from its top edge with
  // the hoist on the pole, then send it in over the road.
  geo.translate(FLAG.length / 2, -FLAG.drop / 2, 0);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const along = pos.getX(i) / FLAG.length;
    const hem = pos.getY(i) < -FLAG.drop / 2;
    // The curl grows with the distance from the hoist: cloth held at one
    // edge is still there and loose at the other.
    pos.setZ(i, pos.getZ(i) + Math.sin(phase + along * 4.4) * FLAG.wave * along);
    const hemY = hem ? -FLAG.drop * (1 - FLAG.taper * along) : 0;
    pos.setY(i, hemY - FLAG.droop * along * along);
  }
  geo.scale(-side, 1, 1);
  geo.computeVertexNormals();
  return geo;
}

/** One side of one board: the pole, its collar and the flag, merged into a
 * single vertex-coloured mesh so a stage's splits cost two draw calls each.
 * Built about the assembly's CENTRE, because that is the point the tumble
 * swings it about once the car has taken it out. */
function flagStaff(side: number, rand: () => number): THREE.Mesh {
  const b = new GeoBuilder(rand);
  const half = POLE.height / 2;
  b.cyl(TINT.pole, POLE.top, POLE.foot, POLE.height, -half, {}, 6);
  // A collar under the hoist in the flag's own colour: it carries the mark
  // down the pole, so a board still reads once the cloth is hanging dead.
  b.cyl(
    TINT.flag,
    POLE.top * 1.5,
    POLE.top * 1.5,
    POLE.collar,
    half - FLAG.hoist - POLE.collar,
    {},
    6,
  );
  b.add(cloth(side, rand() * Math.PI * 2), [TINT.flagLow, TINT.flag], {
    y: half - FLAG.hoist,
  });
  return new THREE.Mesh(b.build(), boardMaterial());
}

/** R28 — the pair of flags at one split board, planted in the same field as
 * every other loose thing beside this road: the field owns them from here,
 * knocks them when the car drives through one, and retires them with the
 * stretch of stage they stand on. */
export function plantSplitBoard(field: ConeField, track: Track, board: Checkpoint): void {
  const s = track.samples[board.index];
  const r = rightOf(s.heading);
  const rand = createRng((track.seed ^ 0x5b28a1f3 ^ Math.round(board.s)) >>> 0);
  for (const side of [-1, 1] as const) {
    // R13 — past a bridge deck's edge is the channel and not a verge, and
    // the parapet is standing where the pole would go. A board that lands
    // on one keeps its flags ON the deck, just inside the mat.
    const lat = side * (s.width / 2 + (s.deck != null ? -0.35 : OUT));
    const staff = flagStaff(side, () => rand.next());
    staff.position.set(
      s.x + r.x * lat,
      s.elevation + corridorOffset(s, lat, s.width) - SINK + POLE.height / 2,
      s.z + r.z * lat,
    );
    staff.rotation.y = s.heading;
    field.plantProp(staff, board.s, {
      // The footprint is the pole and a little of the cloth beside it — not
      // the flag's whole reach, which would have a car fell a board it never
      // came near the foot of.
      reach: 0.55,
      height: POLE.height,
      rest: POLE.foot,
    });
  }
}
