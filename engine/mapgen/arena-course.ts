// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS LAID OUT ON THE TRAINING GROUND — the exercises, as paint, cones
// and things you can hit.
//
// `arena.ts` owns the SHAPE of the ground: the pad, the two graded roads,
// the ramp, the table-top, the banked corner and the berm around the lot.
// This owns everything STANDING on it. The split is the same one the rest
// of the world is built on — the terrain is a height field, and the props
// on it are a list — and it is what keeps either half readable.
//
// Everything here is authored in the arena's own frame: `u` runs east
// across the ground and `v` north along it, both in metres from the middle
// of the pad, and the builder is handed the transform out to world space.
// A number in this file is therefore a number you can pace out on the
// picture `make level` draws, which is the point of authoring a level by
// hand at all.

import { PAD, RAMP, RING, SEAM, TABLE, TARMAC_TO } from "./arena.ts";
import type { ArenaCone, ArenaMarking, ArenaStructure, MarkingTone } from "./arena.ts";

/** C1 — THE SKIDPAD: a painted constant-radius circle on the sealed half.
 * Nothing in the ground at all — a skidpad is a radius and a surface. */
const SKIDPAD = { u: -52, v: -58, radius: 28 } as const;

/** S1 — THE STRAIGHT the launches and the stops are practised on. `box` is
 * where the start box is painted, `brake` where the transverse line is, and
 * `marks` how many metres past that line each stopping board stands — so
 * "I stopped by the third board" is a distance and not an impression. */
const STRAIGHT = {
  u: -95,
  from: -108,
  to: 108,
  box: -100,
  brake: 30,
  marks: [10, 20, 30, 40, 50],
} as const;

/** S2 — THE SLALOM: a line of cones down the sealed half, far enough apart
 * that the car has to be settled between them and close enough that it
 * never quite is. */
const SLALOM = { u: -22, from: -95, to: 95, spacing: 15.8 } as const;

/** K1 — THE KERBED CHICANE: two runs of kerb, offset, so the way through is
 * a left and then a right and the inside of each is something that bites. */
const CHICANE = { u: -58, v: 20, length: 30, offset: 9, gap: 34 } as const;

/** H1 — THE HAIRPIN BOX: two walls of cones on the loose half with tyre
 * stacks around the outside of the turn, laid out at a width where the
 * handbrake is the answer and the steering wheel is not. */
const HAIRPIN = { u: 34, v: -70, length: 42, half: 7.5, spacing: 6 } as const;

/** R1 — THE ROLL LANE: the one exercise on the ground that is not about
 * keeping the car on its wheels.
 *
 * A rally car does not roll off a bank. It rolls because something small
 * and hard at the side of the road catches the bottom of it while the top
 * is still going — a ditch lip, a rock, a kerb — and the body goes over its
 * outside wheels (`collision.ts`'s `tripRoll`). So the lane is a straight
 * with a LOW RUN OF CONCRETE down its right-hand edge: get properly
 * sideways before the yellow line, put the car into the rail, and it will
 * put you over. Nothing else on the training ground will.
 *
 * Past the rail the lane is left open for thirty metres — that is where you
 * find out how far a roll actually carries, which is the whole reason to
 * have one somewhere you can repeat it — and then it runs into a DEBRIS
 * FIELD, because a car going over rarely gets to finish the job undisturbed
 * and what a roll does when it meets something is a different accident
 * again. Boards across the run-out every ten metres, so "it carried past
 * the third board" is a distance and not an impression.
 *
 * `u` is the lane's centre, `rail` where the trip starts and `railRun` how
 * long it is, all in the arena's own metres. */
const ROLL = {
  u: 56,
  half: 7,
  from: 4,
  turnIn: 12,
  rail: 26,
  railRun: 30,
  to: 90,
  marks: [10, 20, 30],
} as const;

/** ...and the rail itself: low enough that it catches the car UNDER its
 * centre of mass and lets the top keep going, which is the window a trip
 * lives in (`collision.solids.tripTop`..`tripFade`), and tall enough not to
 * be something the wheels merely climb (`collision.rideOver`). A wall the
 * body meets square is not a trip; it is a wall. */
const RAIL_HEIGHT = 0.7;

/** The debris downrange, as offsets from the lane's centre and metres up
 * it. Placed by hand and off the lane's middle line, because a rolling body
 * WALKS — it turns about a corner a metre out from its own middle, so it
 * crosses a couple of metres of ground per half turn and arrives nowhere
 * near where it was pointing. A field authored straight ahead is a field
 * the roll curves neatly around. */
const DEBRIS: readonly (readonly [number, number, "tyres" | "post"])[] = [
  [-4.5, 62, "tyres"],
  [2.5, 65, "post"],
  [-1.0, 69, "tyres"],
  [5.0, 72, "post"],
  [-5.5, 75, "post"],
  [1.5, 79, "tyres"],
  [4.5, 83, "post"],
  [-2.5, 86, "tyres"],
];

/** The service yard — where the crew keep what the ground is made of.
 * Inside the south rim, west of the gate, out of everybody's way. */
const YARD = { u: -34, v: -104 } as const;

/** Cone gates flanking the jump's ramp and the table-top, so the run-up has
 * a line to take and the lip is something you aim at rather than find. */
const GATE_OUT = 2.4;

/** Placing an item: the arena's frame turned into world space. */
export type ToWorld = (u: number, v: number) => { x: number; z: number };

export type Course = {
  markings: ArenaMarking[];
  cones: ArenaCone[];
  structures: ArenaStructure[];
};

/** Lay the whole course out. `heading` is the world heading the arena's +v
 * axis points along — every structure's yaw is stated in the local frame
 * and turned by it, so the containers stand square with the pad. */
export function buildCourse(to: ToWorld, heading: number): Course {
  const markings: ArenaMarking[] = [];
  const cones: ArenaCone[] = [];
  const structures: ArenaStructure[] = [];

  const cone = (u: number, v: number, tall = false): void => {
    const p = to(u, v);
    cones.push({ x: p.x, z: p.z, tall });
  };
  const line = (
    u1: number,
    v1: number,
    u2: number,
    v2: number,
    width: number,
    tone: MarkingTone,
  ): void => {
    const a = to(u1, v1);
    const b = to(u2, v2);
    markings.push({ kind: "line", x1: a.x, z1: a.z, x2: b.x, z2: b.z, width, tone });
  };
  const built = (
    kind: ArenaStructure["kind"],
    u: number,
    v: number,
    angle: number,
    length: number,
    width: number,
    height: number,
  ): void => {
    const p = to(u, v);
    structures.push({ kind, x: p.x, z: p.z, angle: heading + angle, length, width, height });
  };

  // ── C1, the skidpad ────────────────────────────────────────────────────
  // The circle itself, and an inner one at half the radius: a skidpad with
  // one line on it tells you where the limit was, and one with two tells
  // you which way you were sliding off it.
  const skid = to(SKIDPAD.u, SKIDPAD.v);
  markings.push({
    kind: "circle",
    x: skid.x,
    z: skid.z,
    radius: SKIDPAD.radius,
    width: 0.6,
    tone: "white",
  });
  markings.push({
    kind: "circle",
    x: skid.x,
    z: skid.z,
    radius: SKIDPAD.radius * 0.5,
    width: 0.4,
    tone: "white",
  });
  // Four cones on the quarters — the circle is paint under the nose at
  // speed, and something standing up is what a drift is actually placed
  // against.
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    cone(SKIDPAD.u + Math.sin(a) * SKIDPAD.radius, SKIDPAD.v + Math.cos(a) * SKIDPAD.radius, true);
  }

  // ── S1, the launch and braking straight ───────────────────────────────
  // The lane it is driven down, the box it is launched out of, the line it
  // is braked at, and the boards past that line.
  line(STRAIGHT.u - 7, STRAIGHT.from, STRAIGHT.u - 7, STRAIGHT.to, 0.45, "white");
  line(STRAIGHT.u + 7, STRAIGHT.from, STRAIGHT.u + 7, STRAIGHT.to, 0.45, "white");
  line(STRAIGHT.u - 7, STRAIGHT.box, STRAIGHT.u + 7, STRAIGHT.box, 0.7, "white");
  line(STRAIGHT.u - 7, STRAIGHT.box + 6, STRAIGHT.u + 7, STRAIGHT.box + 6, 0.7, "white");
  line(STRAIGHT.u - 9, STRAIGHT.brake, STRAIGHT.u + 9, STRAIGHT.brake, 1.2, "yellow");
  for (const m of STRAIGHT.marks) {
    const v = STRAIGHT.brake + m;
    line(STRAIGHT.u - 7, v, STRAIGHT.u + 7, v, 0.6, "white");
    cone(STRAIGHT.u - 8.5, v, true);
    cone(STRAIGHT.u + 8.5, v, true);
  }

  // ── S2, the slalom ────────────────────────────────────────────────────
  for (let v = SLALOM.from; v <= SLALOM.to; v += SLALOM.spacing) cone(SLALOM.u, v, true);

  // ── K1, the kerbed chicane ────────────────────────────────────────────
  // A run of kerb on the left, then one on the right a gap further on: the
  // way through is a flick and a catch, and both apexes are a thing that
  // bites rather than a cone that forgives.
  built("kerb", CHICANE.u - CHICANE.offset, CHICANE.v, 0, CHICANE.length, 0.9, 0.14);
  built("kerb", CHICANE.u + CHICANE.offset, CHICANE.v + CHICANE.gap, 0, CHICANE.length, 0.9, 0.14);
  cone(CHICANE.u - CHICANE.offset - 3, CHICANE.v - CHICANE.length / 2);
  cone(CHICANE.u + CHICANE.offset + 3, CHICANE.v + CHICANE.gap + CHICANE.length / 2);

  // ── H1, the hairpin box ───────────────────────────────────────────────
  // Two cone walls down to a turn, with tyres round the outside of it —
  // the one place on the ground where getting it wrong costs paint.
  for (let i = 0; ; i++) {
    const v = HAIRPIN.v - HAIRPIN.length / 2 + i * HAIRPIN.spacing;
    if (v > HAIRPIN.v + HAIRPIN.length / 2) break;
    cone(HAIRPIN.u - HAIRPIN.half, v);
    cone(HAIRPIN.u + HAIRPIN.half, v);
  }
  const turn = HAIRPIN.v + HAIRPIN.length / 2 + 4;
  built("tyres", HAIRPIN.u, turn, Math.PI / 2, 22, 1.8, 1.2);

  // ── J1 and J2, the ramp and the table-top ─────────────────────────────
  // Gates either side of each lip: the run-up wants a line, and a lip you
  // have to aim at is a lip you can be wrong about, which is the exercise.
  for (const at of [0, RAMP.run]) {
    cone(RAMP.u - RAMP.half - GATE_OUT, RAMP.v + at, true);
    cone(RAMP.u + RAMP.half + GATE_OUT, RAMP.v + at, true);
  }
  for (const at of [-1, 1]) {
    const v = TABLE.v + at * (TABLE.flat / 2 + TABLE.climb);
    cone(TABLE.u - TABLE.half - GATE_OUT, v, true);
    cone(TABLE.u + TABLE.half + GATE_OUT, v, true);
  }
  // The landing, painted: where the car is supposed to come down is a fact
  // about the ramp, and one worth being able to see from the top of it.
  line(
    RAMP.u - RAMP.half,
    RAMP.v + RAMP.run + 26,
    RAMP.u + RAMP.half,
    RAMP.v + RAMP.run + 26,
    0.9,
    "yellow",
  );

  // ── R1, the roll lane ─────────────────────────────────────────────────
  // The lane it is driven down, the line you have to be sideways by, the
  // rail that puts you over, and the boards that say how far it carried.
  line(ROLL.u - ROLL.half, ROLL.from, ROLL.u - ROLL.half, ROLL.to, 0.45, "white");
  line(ROLL.u + ROLL.half, ROLL.from, ROLL.u + ROLL.half, ROLL.to, 0.45, "white");
  line(ROLL.u - ROLL.half, ROLL.turnIn, ROLL.u + ROLL.half, ROLL.turnIn, 1.2, "yellow");
  // A rail down BOTH edges: the exercise is to arrive at one properly
  // sideways, and which hand you go over on should be yours to choose
  // rather than the layout's. It is also what the lane is a model OF — a
  // rally road with a ditch lip either side of it, where running wide in
  // either direction finds something that catches the sill.
  for (const side of [-1, 1]) {
    built(
      "barrier",
      ROLL.u + side * ROLL.half,
      ROLL.rail + ROLL.railRun / 2,
      0,
      ROLL.railRun,
      0.6,
      RAIL_HEIGHT,
    );
    // A tall cone at each end, because a run of concrete a knee high is not
    // something you see coming at a hundred and forty.
    for (const end of [ROLL.rail, ROLL.rail + ROLL.railRun]) {
      cone(ROLL.u + side * (ROLL.half + 2), end, true);
    }
  }
  const runOut = ROLL.rail + ROLL.railRun;
  for (const m of ROLL.marks) {
    line(ROLL.u - ROLL.half, runOut + m, ROLL.u + ROLL.half, runOut + m, 0.6, "white");
  }
  for (const [du, v, kind] of DEBRIS) {
    if (kind === "tyres") built("tyres", ROLL.u + du, v, Math.PI / 2, 5, 1.8, 1.2);
    else built("fence", ROLL.u + du, v, Math.PI / 3, 6, 0.2, 1.3);
  }

  // ── The seam road, edged ──────────────────────────────────────────────
  // It is gravel on a gravel pad for half its length, so what makes it read
  // as a road is the marker posts down it and the tarmac's own edge line
  // stopping short of it.
  for (let v = -PAD + 12; v <= PAD - 12; v += 24) {
    cone(-SEAM.half - 1.5, v, true);
    cone(SEAM.half + 1.5, v, true);
  }
  line(TARMAC_TO, -PAD + 8, TARMAC_TO, PAD - 8, 0.5, "white");

  // ── The service yard ──────────────────────────────────────────────────
  built("container", YARD.u, YARD.v, 0, 12.2, 2.5, 2.6);
  built("container", YARD.u + 8, YARD.v - 3, Math.PI / 2, 12.2, 2.5, 2.6);
  built("tyres", YARD.u - 7, YARD.v + 2, 0, 6, 1.8, 1.2);
  built("barrier", YARD.u + 2, YARD.v + 9, Math.PI / 2, 24, 0.6, 1);
  for (let i = 0; i < 6; i++)
    cone(YARD.u - 10 + (i % 3) * 1.3, YARD.v - 4 + Math.floor(i / 3) * 1.4);

  // ── The gate, and the fence either side of it ─────────────────────────
  // The berm is cut away here for the approach road; a fence line across
  // what is left says the gap is the way in rather than the way the bank
  // happens to have been built.
  const rim = -PAD + 4;
  built("fence", -46, rim, Math.PI / 2, 44, 0.2, 1.3);
  built("fence", 46, rim, Math.PI / 2, 44, 0.2, 1.3);

  // ── The ring's banked corner, marked ──────────────────────────────────
  // Tall cones down the inside of the banking, so the line round it is
  // something you place the car against instead of guessing at.
  const inner = RING.at - RING.corner;
  for (let a = 0; a <= Math.PI / 2 + 1e-6; a += Math.PI / 12) {
    const r = RING.corner - RING.half - 2;
    cone(inner + Math.sin(a) * r, inner + Math.cos(a) * r, true);
  }

  return { markings, cones, structures };
}
