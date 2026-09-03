// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAINING GROUND — the one place in this game that is not generated.
//
// Every other stage in the game is a seed: the rules engine reads its dials
// and builds a road nobody authored. This is the opposite of that, and it
// has to be. A place to LEARN a car in is a place where the same corner is
// in the same spot every time, at a radius somebody chose, with a jump you
// can hit twice in a minute — none of which a search can be asked for. So
// the arena is laid out here by hand, in metres, and the numbers in this
// file ARE the level.
//
// It is also shaped differently from a stage. A stage is a ribbon: the car
// is located against a centerline and everything — the ground it rides, the
// surface, the way home — is read off that. An arena is a PLACE, and the
// engine already knows how to drive on one of those: step.ts's wild branch
// (the one an off-road excursion runs in) takes its ground from a plain
// height field over (x, z), reads the slope and the brow along the car's
// own travel, and asks `spurSurfaceAt` what the car is standing on. None of
// it wants a centerline. So the training ground is built as terrain, the
// car spends the whole session in that branch, and the ribbon that exists
// is a stub: the approach road the run starts on, and the thing a reset
// puts the car back at.
//
// THE LATTICE IS THE CONSTRAINT THAT SHAPES EVERYTHING HERE. The ground the
// car rides is the height field sampled on a fixed grid and interpolated
// across the triangles the renderer draws, and the country's own grid is
// GROUND_CELL — 14 m. A jump ramp eight metres long does not exist on a
// 14 m lattice; it is smoothed away before the car ever reaches it. So the
// arena carries its own finer lattice (`ARENA_CELL`, a quarter of the
// country's, which is what makes the two nest at shared corners), and every
// feature in the layout below is sized to be RESOLVED by it: the ramp runs
// thirty metres, the table-top is sixty end to end, the banked corner is a
// bowl and not a kerb. Anything that has to be smaller than that — the
// kerbs of the chicane, the marker cones — is a solid or a prop, never a
// shape in the ground.

import { GROUND_CELL } from "./lattice.ts";
import type { Surface } from "./compile.ts";
import type { SolidKind, WildObstacle } from "./solids.ts";
import { buildCourse } from "./arena-course.ts";

/** The arena's own ground lattice, m. A quarter of the country's cell, so
 * every country corner is also an arena corner and the two fields meet
 * without a seam at the rim. Fine enough that a thirty-metre ramp is nine
 * cells of climb and its lip is a real edge rather than a rounded shoulder. */
export const ARENA_CELL = GROUND_CELL / 4;

/** Half the graded pad, m — the arena is this square, corners rounded off.
 * 118 m of half-width is 236 m of driving across the middle, which is what
 * makes a 220 m braking straight and a 56 m skidpad fit side by side with
 * room to get between them. */
export const PAD = 118;
/** …offered under the name the rest of the engine asks for it by. */
export { PAD as ARENA_PAD };
/** How much the pad's corners are rounded, m. */
export const PAD_CORNER = 30;

/** THE PERIMETER ROAD — a graded gravel ring inside the pad's rim, so the
 * exercises have a lap to be strung together on. `at` is its centerline's
 * offset from the middle, `corner` the radius its corners turn at, `half`
 * half its width, and `crown` how proud of the pad the graded mat stands. */
export const RING = { at: 104, corner: 36, half: 6.5, crown: 0.35 } as const;

/** THE SEAM — the gravel road down the middle, dividing the sealed half
 * from the loose one. Its whole job is to be a road you cross at speed
 * while changing surfaces, so it stands proud of both pads on its own
 * crown and hands over to them across a graded shoulder. */
export const SEAM = { half: 5.5, shoulder: 4, crown: 0.35 } as const;

/** West of this the pad is sealed; east of it, and everywhere the seam and
 * the ring run, it is graded stone. The gap between it and the seam's own
 * edge is the gravel verge the tarmac ends against. */
export const TARMAC_TO = -8;

/** THE EARTH BANKS — the arena sits in a shallow bowl. `rise` is how far
 * out the berm climbs from the pad's rim, `height` how high it stands, and
 * `fall` how far past its crest it lets itself back down into whatever
 * country the seed built. It is a boundary and not a wall: a car that wants
 * out drives over it, which is the whole difference between a training
 * ground and an arena with the lid on. */
const BANK = { rise: 16, height: 3.6, fall: 26 } as const;

/** THE GATE — the gap cut in the south berm for the approach road, and how
 * far to either side of the seam's line it opens. */
export const GATE = { half: 14, fade: 10 } as const;

/** THE BANKED CORNER — the ring's north-east turn, tilted up into the berm
 * behind it. `rise` is how far the outer edge of the mat stands over its
 * inner one (over the ring's 13 m width, ~11°), and `fade` how much of the
 * straight either side the tilt is rolled in over, so the car is never
 * asked to take up camber in one step. */
const BANKED = { rise: 2.6, fade: 24 } as const;

/** J1 — THE JUMP. A graded ramp with a lip at the top and nothing after it:
 * the ground drops back to the pad within a cell, which is an EDGE, and the
 * wild branch's brow rule throws the car off it. `foot` is where the climb
 * starts (local metres), `run` how long it climbs for, `lip` how high it
 * finishes, `half` half the ramp's width and `flank` how far its shoulders
 * taper down over, so a car can decline the jump by going round it. */
export const RAMP = { u: 72, v: -30, run: 22, lip: 3, half: 7, flank: 5, drop: 3.5 } as const;

/** J2 — THE TABLE-TOP: up, along and down, all of it drivable. What it
 * teaches is the opposite of the ramp — a crest taken fast enough still
 * throws the car, and the flat top is where you find out how fast that is. */
export const TABLE = { u: 34, v: 55, climb: 15, flat: 20, height: 2, half: 8, flank: 5 } as const;

/** THE COUNTRY the training ground stands in. Exported because the app
 * builds a stage spec for the run and the debug overlay prints its dials:
 * handing it the rule book's defaults would have the overlay report a
 * hilly, wet, half-sealed stage over a flat dry pad. */
export const ARENA_KNOBS = {
  elevation: 0,
  water: 0,
  trees: 0.35,
  asphalt: 0,
  width: 0.6,
  steepness: 0,
} as const;

/** How the arena's local frame stands in the world: the pad's middle, and
 * the heading its +v axis points along. Both are decided when the stub road
 * is compiled, so the arena always sits square on the end of its approach. */
export type ArenaFrame = { x: number; z: number; heading: number };

/** A mark painted on the arena's surface. Everything here is renderer work
 * — paint stops nothing and weighs nothing — but it is AUTHORED here,
 * beside the exercise it belongs to, so the circle the car drifts round and
 * the circle it is drawn round are one radius and not two. */
export type ArenaMarking =
  | { kind: "circle"; x: number; z: number; radius: number; width: number; tone: MarkingTone }
  | {
      kind: "line";
      x1: number;
      z1: number;
      x2: number;
      z2: number;
      width: number;
      tone: MarkingTone;
    };

/** White is a lane and a boundary; yellow is a thing to aim at or stop by. */
export type MarkingTone = "white" | "yellow";

/** A cone, where it stands. Cones are the renderer's (they weigh a kilo and
 * the run is identical whether one was hit or not — see `cones.ts`), so
 * this list is a layout and never a collision. `tall` picks the metre-and-a-
 * half marker over the ordinary one. */
export type ArenaCone = { x: number; z: number; tall: boolean };

/** Something BUILT standing on the arena: a container, a barrier run, a
 * stack of tyres. The box is what the renderer draws; the run of solids the
 * physics stops against is derived from it at compile time, exactly as a
 * house is drawn as a house and collided as a run of wall bays. */
export type ArenaStructure = {
  kind: ArenaStructureKind;
  x: number;
  z: number;
  /** Yaw, radians — the long axis' heading. */
  angle: number;
  /** Full extent along the long axis and across it, m. */
  length: number;
  width: number;
  height: number;
};

export type ArenaStructureKind = "container" | "barrier" | "tyres" | "kerb" | "fence";

/** THE TRAINING GROUND, compiled: where it stands, what shape its ground
 * is, what the ground is made of, and everything standing on it. */
export type ArenaPlan = {
  frame: ArenaFrame;
  /** Half the graded pad, m — what anything asking "is this the arena"
   * measures against, plus the berm's whole reach. */
  reach: number;
  markings: ArenaMarking[];
  cones: ArenaCone[];
  structures: ArenaStructure[];
  /** The structures above, as the circles the contact model stops against. */
  solids: WildObstacle[];
  /** Ground height at a world position, m — the pad, its roads' crowns, the
   * ramp, the table-top, the banked corner and the berm around the lot. It
   * is the ANALYTIC shape: what stands on the arena, and what the car rides,
   * is this sampled on `ARENA_CELL` and interpolated (`arenaGroundAt`). */
  heightAt: (x: number, z: number) => number;
  /** What the arena is made of at a world position, or null off the pad. */
  surfaceAt: (x: number, z: number) => Surface | null;
  /** How much the arena owns the ground here, 0 (open country, out past the
   * berm) to 1 (the pad itself). The terrain field blends the country's own
   * height into the arena's across this. */
  weightAt: (x: number, z: number) => number;
  /** Whether a world position stands on a BUILT jump lip — the one place
   * off a road where the ground was shaped to throw the car rather than
   * merely happening to. `step()` reads it into `GroundContext.lip`. */
  lipAt: (x: number, z: number) => boolean;
};

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Hermite ease over 0..1 — every roll-in and roll-out in this file. */
function smooth(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** Signed distance to a rounded rectangle centred on the local origin:
 * negative inside, zero on the edge, positive out. The one shape the pad,
 * its berm and the perimeter road are all measured against. */
function roundedRect(u: number, v: number, half: number, radius: number): number {
  const du = Math.abs(u) - (half - radius);
  const dv = Math.abs(v) - (half - radius);
  const outside = Math.hypot(Math.max(du, 0), Math.max(dv, 0));
  return outside + Math.min(Math.max(du, dv), 0) - radius;
}

/** A road's own cross-section, as a share of its crown: 1 on the mat, rolled
 * off to 0 across the shoulder beside it. Shared by the seam and the ring,
 * because a graded road is a graded road. */
function mat(offset: number, half: number, shoulder: number): number {
  const d = Math.abs(offset);
  if (d <= half) return 1;
  return 1 - smooth((d - half) / shoulder);
}

/** J1 — the ramp's own height at a point in the local frame. It climbs with
 * a slight kick at the top (the exponent), and then simply stops: past the
 * lip the ground is back on the pad within `drop`, which is under half the
 * brow baseline the physics reads, so the edge throws the car rather than
 * rounding it off. */
function rampHeight(u: number, v: number): number {
  const across = mat(u - RAMP.u, RAMP.half, RAMP.flank);
  if (across <= 0) return 0;
  const t = (v - RAMP.v) / RAMP.run;
  if (t <= 0) return 0;
  if (t >= 1) {
    const past = v - (RAMP.v + RAMP.run);
    return past >= RAMP.drop ? 0 : RAMP.lip * across * (1 - smooth(past / RAMP.drop));
  }
  return RAMP.lip * across * Math.pow(t, 1.35);
}

/** J1 — is this point ON the ramp's lip: the last stretch of the climb and
 * the face immediately past it.
 *
 * The physics has a branch for a BUILT jump (`GroundContext.lip`) that
 * launches the car off the top of the ramp at the speed the ramp was
 * designed around, rather than gluing it down the landing face and letting
 * the flight start two steps late as a bob. Every jump on a generated stage
 * gets it, off the lip flag the compiler puts on the sample; nothing off
 * the road ever has, because until there was a training ground nothing off
 * the road was ever BUILT as a jump. This is that flag, for this ramp. */
function onRampLip(u: number, v: number): boolean {
  if (mat(u - RAMP.u, RAMP.half, RAMP.flank) <= 0) return false;
  const top = RAMP.v + RAMP.run;
  return v > top - RAMP.run * 0.25 && v < top + RAMP.drop;
}

/** J2 — the table-top: a climb, a flat, and a matching fall, centred on
 * `TABLE.v`. Symmetric on purpose — it is a crest to be taken in either
 * direction, and a car that learns it one way should not be surprised the
 * other. */
function tableHeight(u: number, v: number): number {
  const across = mat(u - TABLE.u, TABLE.half, TABLE.flank);
  if (across <= 0) return 0;
  const half = TABLE.flat / 2;
  const d = Math.abs(v - TABLE.v);
  if (d <= half) return TABLE.height * across;
  const t = (d - half) / TABLE.climb;
  if (t >= 1) return 0;
  return TABLE.height * across * (1 - smooth(t));
}

/** Signed offset from the perimeter road's centerline, m — positive outside
 * the ring, negative inside it. */
function ringOffset(u: number, v: number): number {
  return roundedRect(u, v, RING.at, RING.corner);
}

/** How far into the ring's NORTH-EAST corner a point is, 0..1 — the window
 * the banked corner's tilt is rolled in and out over. It is 1 only where
 * both of the straights either side have run out, which is exactly the
 * rounded part of the ring. */
function neCorner(u: number, v: number): number {
  const inner = RING.at - RING.corner;
  return smooth((u - inner) / BANKED.fade) * smooth((v - inner) / BANKED.fade);
}

/** The banked corner's contribution: the mat tilts up toward the outside of
 * the turn, and stays up past its outer edge so the berm behind it starts
 * from the top of the banking instead of stepping off it. */
function bankedHeight(u: number, v: number): number {
  const w = neCorner(u, v);
  if (w <= 0) return 0;
  const off = ringOffset(u, v);
  if (off < -RING.half - SEAM.shoulder) return 0;
  return BANKED.rise * w * clamp01((off + RING.half) / (2 * RING.half));
}

/** The graded roads' crowns — the seam down the middle and the ring around
 * the outside, both standing proud of the pad they were bladed onto. Taken
 * as the higher of the two rather than the sum, so their crossing is one
 * graded plane and not a pair of speed bumps. */
function roadCrown(u: number, v: number): number {
  // Both roads are ON the pad and stop with it: past the rim the ground is
  // the berm, and a graded crown running up the outside of the bank is a
  // road going nowhere. It is rolled out over a shoulder's width rather
  // than cut, so the approach road meets the seam through the gate on a
  // grade instead of a step.
  const past = roundedRect(u, v, PAD, PAD_CORNER);
  if (past > SEAM.shoulder) return 0;
  const edge = past > 0 ? 1 - smooth(past / SEAM.shoulder) : 1;
  const seam = SEAM.crown * mat(u, SEAM.half, SEAM.shoulder);
  const ring = RING.crown * mat(ringOffset(u, v), RING.half, SEAM.shoulder);
  return Math.max(seam, ring) * edge;
}

/** How much of the south berm is cut away for the approach road, 0 (the
 * open gate) to 1 (berm as built). */
function gateCut(u: number, v: number): number {
  if (v > -PAD + BANK.rise) return 1;
  // The gate is cut on the seam road's own line, which is the middle of
  // the pad — the approach road runs straight in and becomes it.
  return smooth((Math.abs(u) - GATE.half) / GATE.fade);
}

/** THE BERM, as a height and a weight together: how far the ground has been
 * pushed up outside the pad's rim, and how much of the arena's own shape is
 * still being asserted there. They are one function because they are one
 * decision — past the point the berm has let itself back down, the country
 * the seed built is the ground, and the arena has nothing more to say. */
function berm(d: number): { height: number; weight: number } {
  if (d <= 0) return { height: 0, weight: 1 };
  if (d <= BANK.rise) return { height: BANK.height * smooth(d / BANK.rise), weight: 1 };
  const t = (d - BANK.rise) / BANK.fall;
  if (t >= 1) return { height: 0, weight: 0 };
  const ease = 1 - smooth(t);
  return { height: BANK.height * ease, weight: ease };
}

/** The arena's ground in its OWN frame, m. The pad is flat by construction
 * — which is what makes it a pad — and everything above zero here is
 * something that was built on it. */
function localHeight(u: number, v: number): number {
  const d = roundedRect(u, v, PAD, PAD_CORNER);
  const shape = berm(d);
  const built = roadCrown(u, v) + rampHeight(u, v) + tableHeight(u, v) + bankedHeight(u, v);
  return built + shape.height * gateCut(u, v);
}

/** …and what it is made of, in the same frame. */
function localSurface(u: number, v: number): Surface | null {
  if (roundedRect(u, v, PAD, PAD_CORNER) > 0) return null;
  if (Math.abs(ringOffset(u, v)) <= RING.half) return "gravel";
  if (Math.abs(u) <= SEAM.half) return "gravel";
  return u < TARMAC_TO ? "asphalt" : "gravel";
}

/** The physical numbers for each thing that stands on the arena. A kerb is
 * deliberately under `TUNING.collision.rideOver`: the wheels clip it for a
 * thump and a lurch (`clipSolids`) instead of the body folding against it,
 * which is what a kerb does to a car and what makes one worth clipping. */
const SOLID: Record<
  ArenaStructureKind,
  {
    kind: SolidKind;
    bay: number;
    radius: number;
    height: number;
    mass: number;
    rooted: number;
    snap: number;
  }
> = {
  container: {
    kind: "container",
    bay: 1.2,
    radius: 1.5,
    height: 2.6,
    mass: 2200,
    rooted: 0.9,
    snap: Infinity,
  },
  barrier: {
    kind: "barrier",
    bay: 1.4,
    radius: 0.9,
    height: 1,
    mass: 1400,
    rooted: 0.85,
    snap: Infinity,
  },
  tyres: { kind: "tyres", bay: 1.6, radius: 0.9, height: 1.2, mass: 240, rooted: 0.2, snap: 3200 },
  kerb: { kind: "kerb", bay: 0.9, radius: 0.5, height: 0.14, mass: 90, rooted: 1, snap: Infinity },
  fence: { kind: "post", bay: 3, radius: 0.14, height: 1.3, mass: 22, rooted: 0.5, snap: 900 },
};

/** Turn a built thing into the run of circles the contact model stops
 * against. Bays are spaced along the long axis and sized so the run has no
 * gap a nose can find — the parapet's rule, for the parapet's reason. */
function baysOf(s: ArenaStructure, heightAt: (x: number, z: number) => number): WildObstacle[] {
  const def = SOLID[s.kind];
  const count = Math.max(1, Math.round(s.length / def.bay));
  const sin = Math.sin(s.angle);
  const cos = Math.cos(s.angle);
  const out: WildObstacle[] = [];
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? 0 : (i / (count - 1) - 0.5) * s.length;
    const x = s.x + sin * along;
    const z = s.z + cos * along;
    out.push({
      x,
      z,
      y: heightAt(x, z),
      kind: def.kind,
      size: 1,
      spin: s.angle,
      radius: def.radius,
      height: s.height,
      mass: def.mass,
      rooted: def.rooted,
      snap: def.snap,
    });
  }
  return out;
}

/** The arena's ground lattice, sampled and interpolated exactly the way the
 * country's is (`TerrainField.groundAt`) — same diagonal, same triangles,
 * finer cell. It is what the car RIDES and what the renderer DRAWS, and
 * they are the same surface because they are the same function.
 *
 * The corner heights are cached: an off-road step reads the ground half a
 * dozen times (the centre, the four wheels, the brow either side), and the
 * arena's own height field runs a rounded-rect distance and five feature
 * shapes for every one of them. */
function latticeSampler(
  heightAt: (x: number, z: number) => number,
): (x: number, z: number) => number {
  let corners = new Map<number, number>();
  const corner = (i: number, j: number): number => {
    // The two indices are packed into one key rather than a string: this is
    // read on every physics step and a string join per corner is real money.
    const key = (i + 32768) * 65536 + (j + 32768);
    const hit = corners.get(key);
    if (hit !== undefined) return hit;
    if (corners.size > 8192) corners = new Map();
    const y = heightAt(i * ARENA_CELL, j * ARENA_CELL);
    corners.set(key, y);
    return y;
  };
  return (x, z) => {
    const gx = x / ARENA_CELL;
    const gz = z / ARENA_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    if (fx + fz <= 1) {
      const h00 = corner(i, j);
      return h00 + fx * (corner(i + 1, j) - h00) + fz * (corner(i, j + 1) - h00);
    }
    const h11 = corner(i + 1, j + 1);
    return h11 + (1 - fx) * (corner(i, j + 1) - h11) + (1 - fz) * (corner(i + 1, j) - h11);
  };
}

/** How far the arena reaches from its middle, m — the pad plus the whole
 * berm. Past this the training ground has no opinion about the ground and
 * the country the seed built is simply the country. */
export const ARENA_REACH = PAD + BANK.rise + BANK.fall;

/** Build the training ground standing on `frame`.
 *
 * The plan is pure geometry: it knows where everything is and what shape
 * the ground is, and nothing at all about how any of it is drawn or how the
 * car is stepped over it. The terrain field lays it over the country
 * (`arenaTerrain`), the renderer draws it (`pwa/src/game/arena.ts`), and
 * both read this one object. */
export function buildArena(frame: ArenaFrame): ArenaPlan {
  const sin = Math.sin(frame.heading);
  const cos = Math.cos(frame.heading);
  // World to local: the inverse rotation of the frame's own heading. `v`
  // runs along the heading and `u` out to its right, which is the same
  // frame the car's own axes are stated in.
  const local = (x: number, z: number): { u: number; v: number } => {
    const dx = x - frame.x;
    const dz = z - frame.z;
    return { u: dx * cos - dz * sin, v: dx * sin + dz * cos };
  };
  const world = (u: number, v: number): { x: number; z: number } => ({
    x: frame.x + u * cos + v * sin,
    z: frame.z - u * sin + v * cos,
  });

  const heightAt = (x: number, z: number): number => {
    const p = local(x, z);
    return localHeight(p.u, p.v);
  };
  const surfaceAt = (x: number, z: number): Surface | null => {
    const p = local(x, z);
    return localSurface(p.u, p.v);
  };
  const weightAt = (x: number, z: number): number => {
    const p = local(x, z);
    return berm(roundedRect(p.u, p.v, PAD, PAD_CORNER)).weight;
  };
  const lipAt = (x: number, z: number): boolean => {
    const p = local(x, z);
    return onRampLip(p.u, p.v);
  };

  const ground = latticeSampler(heightAt);
  const course = buildCourse(world, frame.heading);
  const solids: WildObstacle[] = [];
  for (const s of course.structures) solids.push(...baysOf(s, ground));

  return {
    frame,
    reach: ARENA_REACH,
    markings: course.markings,
    cones: course.cones,
    structures: course.structures,
    solids,
    heightAt,
    surfaceAt,
    weightAt,
    lipAt,
  };
}

/** The arena's ground as the car rides it and the renderer draws it: the
 * plan's analytic height on the arena lattice. Built per caller (each keeps
 * its own corner cache) and identical between them, which is what lets the
 * engine and the app each make one without being handed the other's. */
export function arenaGroundAt(plan: ArenaPlan): (x: number, z: number) => number {
  return latticeSampler(plan.heightAt);
}
