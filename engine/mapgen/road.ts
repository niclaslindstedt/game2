// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R16 — the road's CROSS-SECTION: what the ribbon looks like across its
// width, and how the ground falls away beside it. A rally road is not a
// flat carpet ruled onto the landscape. Cars have driven it: two worn
// tracks run down it where every one of them puts its wheels, the loose
// gravel they push aside piles at the edges, and the whole surface is
// crowned so water runs off it. Asphalt is laid ON the ground rather than
// cut into it, so the mat stands proud of the verge with its chippings
// spilled down the edge — and past the shoulder, on both, the ground
// simply falls away into the country. No ditch: a trench ruled down each
// side of the road reads as a scar cut by a machine, and it is a trap
// that swallows a car the moment it puts a wheel wide.
//
// R19 — and where the road TURNS it is banked. The whole cross-section
// rolls into the corner, outside edge proud of the inside, over a runoff
// long enough that the car settles onto it rather than hitting it. The
// tilt is applied to the corridor as a whole — mat, shoulder and the
// ground beside it — because that is how a road is built.
//
// One module, three consumers, one shape: the renderer builds the ribbon
// from these numbers, the terrain field beside the road reads the same
// verge profile, and the physics rides it. Change a number here and all
// three move together — which is the whole reason it is not three sets of
// numbers in three files.

import type { BridgeDeck, Surface } from "./compile.ts";
import { STAGE_RULES as R } from "./rules.ts";

/** The cross-section, in meters unless noted. Lateral positions are given
 * as a fraction of the road's half-width (`t`, 0 at the centerline, 1 at
 * the edge) where the shape should scale with the road, and in meters
 * where it is a real-world size — a wheel track is a wheel track whatever
 * the road does. */
export const ROAD_CROSS = {
  /** Camber: how much lower the edge sits than the crown. Gravel is
   * bladed into a pronounced roof so it sheds water; asphalt is laid
   * flatter. */
  crown: { gravel: 0.17, asphalt: 0.1, deck: 0.03 },

  /** The worn racing line: two tracks where every car that came before put
   * its wheels. `at` is their lateral position as a fraction of the
   * half-width, `width` how wide one track is, `depth` how far the gravel
   * is worn down inside it — and on asphalt, how little (a sealed road
   * polishes rather than ruts). */
  rut: {
    at: 0.44,
    width: 1.35,
    depth: { gravel: 0.085, asphalt: 0.015, deck: 0 },
  },

  /** The berm: the loose stuff the traffic pushes to the outside, piled up
   * over the last tenth of the road's width. */
  berm: { from: 0.86, height: 0.06 },

  /** Asphalt is built UP: the mat stands this proud of the ground beside
   * it, and its edge falls away over `chamfer` meters of broken kerb and
   * spilled chippings. */
  asphaltLift: 0.2,
  chamfer: 0.7,
  /** Meters of road over which the mat ramps up out of (or back down to)
   * the gravel at a paving boundary — an asphalt section starts with a
   * joint, not a step. */
  liftRamp: 14,

  /** Beside the road: the strip of grubbed, gravel-dusted ground the
   * traffic and the blade keep bare, then the ground tipping gently away
   * into whatever the country was doing. Distances are from the road
   * EDGE; `shoulder` is how far below the mat's own base the bare strip
   * sits, and `drop` how much further the ground has leaned away by the
   * time the landscape takes over — a slope a car can run out onto and get
   * back off, which is the whole difference between a verge and a ditch. */
  verge: {
    shoulder: 0.14,
    bareTo: 1.6,
    /** Total drop from the shoulder to where the landscape takes over, m.
     * Small on purpose: the ground lattice beside the road is pinned just
     * under the ribbon's outer lip, so a verge that keeps falling drags a
     * step of ground down with it and the tiles beside the road start
     * showing as blocks. A road sits a little proud of its field; it does
     * not stand on an embankment down both sides. */
    drop: 0.24,
  },

  /** How far past the road edge the ribbon's own geometry reaches — the
   * shoulder and the grassed slope past it belong to the ROAD mesh, which
   * is sampled every 2 m along the stage, not to the 14 m ground lattice
   * that could never hold a road's edge. Beyond it the landscape takes
   * over. */
  reach: 6.5,
} as const;

/** R23 — the room a road of `width` keeps to itself, m, measured
 * CENTERLINE to centerline: both corridors' full reach (mat plus the verge
 * the ribbon draws beside it) plus the bare country between them. The
 * terrain can only lay its shelf under one road, so two corridors closer
 * than this leave one of them hanging over the country with nothing under
 * it. It has to scale with the `width` dial: a fixed number that clears two
 * lane-wide roads is inside the mats of two boulevard-wide ones. */
export function roadClearance(width: number): number {
  const corridor = width / 2 + ROAD_CROSS.reach;
  return Math.max(R.minSelfDistance, 2 * corridor + R.roadClear.margin);
}

function sq(v: number): number {
  return v * v;
}

/** Everything about a piece of road that decides its shape ACROSS the
 * width. Both the stage's samples and an abandoned branch's satisfy it, so
 * the physics, the renderer and the preview tooling all ask the same
 * question of the same object rather than unpacking it into five
 * positional arguments each. */
export type RoadShape = {
  surface: Surface;
  /** Set on a bridge deck — flat planks or concrete, not a graded road. */
  deck?: BridgeDeck | null;
  /** How proud of the ground beside it the mat stands, m. */
  lift: number;
  /** R19 — the corner's cross-fall, m per m, signed so the surface tilts
   * by `-bank * lateral`: positive raises the LEFT edge, which is the
   * outside of a right-hand turn. */
  bank?: number;
  /** R17 — how much of the cross-section is warped flat onto a junction
   * platform, 0 (open road) to 1 (inside the junction). A junction is one
   * graded plane: no crown, no camber, no wheel tracks, because two roads
   * cannot each keep their own and still be one surface. */
  flat?: number;
};

/** Which cross-section a sample wears. A ford is flat water and a bridge
 * deck is flat concrete or plank — neither is bladed, rutted, or crowned
 * like a road that gets graded. */
function shapeOf(shape: RoadShape): "gravel" | "asphalt" | "deck" {
  if (shape.deck != null || shape.surface === "water") return "deck";
  return shape.surface === "asphalt" ? "asphalt" : "gravel";
}

/** R19 — how much of the crown survives a bank. A banked corner is not a
 * crowned road tipped over: the blade takes the crown out and lays the
 * whole width on one plane, or the inside edge would be a gutter. */
function crownScale(bank: number, kind: "gravel" | "asphalt" | "deck"): number {
  const full = Math.max(ROAD_CROSS.crown[kind], 1e-6);
  return Math.max(0, 1 - Math.abs(bank) / full);
}

/** Height of the DRIVEN surface at lateral offset `lateral` (m, signed
 * from the centerline), relative to the sample's own elevation — which is
 * the road's height on the crown, so this only ever falls away. Inside the
 * road only; past the edge, `vergeOffset` takes over. */
export function crossOffset(shape: RoadShape, lateral: number, width: number): number {
  const kind = shapeOf(shape);
  const open = 1 - clamp01(shape.flat ?? 0);
  const bank = (shape.bank ?? 0) * open;
  const half = width / 2;
  const t = Math.min(1, Math.abs(lateral) / half);
  let y = -ROAD_CROSS.crown[kind] * crownScale(bank, kind) * open * t * t - bank * lateral;
  const depth = ROAD_CROSS.rut.depth[kind] * open;
  if (depth > 0) {
    // Two tracks, each a soft trough — a hard-edged groove would be a rail
    // the car steers against instead of a line it settles into.
    const from = Math.abs(lateral) - ROAD_CROSS.rut.at * half;
    y -= depth * Math.exp(-sq(from / ROAD_CROSS.rut.width));
  }
  if (kind === "gravel" && t > ROAD_CROSS.berm.from) {
    y += ROAD_CROSS.berm.height * open * ((t - ROAD_CROSS.berm.from) / (1 - ROAD_CROSS.berm.from));
  }
  return y;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How worn the surface is at a lateral offset, 0 (untouched edge) to 1
 * (the bottom of a wheel track). The renderer paints with it — polished
 * dark lines down an asphalt lane, gravel scrubbed to hardpack down a
 * dirt one — and the preview tooling shades the same way. */
export function wearAt(lateral: number, width: number): number {
  const half = width / 2;
  const t = Math.min(1, Math.abs(lateral) / half);
  const from = Math.abs(lateral) - ROAD_CROSS.rut.at * half;
  const inRut = Math.exp(-sq(from / (ROAD_CROSS.rut.width * 0.9)));
  // Everything between the tracks is swept too (the middle of the road is
  // driven, just not worn into a groove); the outer tenth never is.
  const swept = 0.45 * (1 - Math.min(1, sq(t / 0.8)));
  return Math.min(1, Math.max(inRut, swept));
}

/** The ground beside the road, relative to the sample's elevation: the
 * mat's edge, the bare shoulder, and the grassed slope tipping away to
 * where the landscape takes over. `out` is meters past the road EDGE;
 * `lift` is how proud the mat stands there (0 on gravel, up to
 * `asphaltLift` on a paved run). There is no ditch (R16) — past the
 * shoulder the ground simply leans away. */
export function vergeOffset(out: number, lift: number, edgeY: number): number {
  const v = ROAD_CROSS.verge;
  // Off the mat: the edge falls to the shoulder over the chamfer — a step
  // on asphalt, barely anything on gravel.
  const base = -lift - v.shoulder;
  if (out <= ROAD_CROSS.chamfer) {
    const t = out / ROAD_CROSS.chamfer;
    return edgeY + (base - edgeY) * t * t * (3 - 2 * t);
  }
  if (out <= v.bareTo) return base;
  // Past the bare strip the ground breaks over and then flattens into the
  // field — steepest right off the shoulder, level again by the lip, which
  // is the shape a graded verge actually settles into and the one that
  // hands the landscape back a height it can carry on from.
  const t = clamp01((out - v.bareTo) / (ROAD_CROSS.reach - v.bareTo));
  return base - v.drop * (1 - (1 - t) * (1 - t));
}

/** The whole corridor profile in one call: inside the road it is the
 * driven surface, outside it the verge. Distance is SIGNED lateral so the
 * two halves of the road can differ; `width` is the full road width. The
 * bank keeps tilting past the edge, because the ground a banked corner is
 * built on is banked with it. */
export function corridorOffset(shape: RoadShape, lateral: number, width: number): number {
  const half = width / 2;
  const out = Math.abs(lateral) - half;
  if (out <= 0) return crossOffset(shape, lateral, width);
  // A deck has no verge at all — past the parapet is air, and the ground
  // under it is the channel the terrain carved.
  if (shape.deck != null) return -shape.lift - 0.4;
  const bank = (shape.bank ?? 0) * (1 - clamp01(shape.flat ?? 0));
  const edge = Math.sign(lateral) * half;
  return (
    vergeOffset(out, shape.lift, crossOffset(shape, edge, width) + bank * edge) - bank * lateral
  );
}

/** R17 — how far a point lies past the MAIN road's edge at a junction, m:
 * negative on the main road's own mat, positive out past it, and null
 * where the junction has nothing to say about the point.
 *
 * This is the line every junction is built around. The main road — the
 * sealed one, which runs straight through — keeps its full width, and the
 * minor road it meets simply STOPS at that edge, cut at its angle. So the
 * seam between tarmac and gravel is not a band ruled across the minor
 * road: it is the main road's own edge, which is what it looks like from a
 * car and from the air. */
export function junctionMainEdge(
  junction: { x: number; z: number; heading: number; width: number; reach: number },
  x: number,
  z: number,
): number | null {
  const dx = x - junction.x;
  const dz = z - junction.z;
  // Along the main road's line, measured BOTH ways: the main road runs
  // through the junction, so its mat reaches back the way it came as far
  // as it reaches on toward wherever the branch is going.
  const along = dx * Math.sin(junction.heading) + dz * Math.cos(junction.heading);
  if (Math.abs(along) > junction.reach) return null;
  const across = dx * Math.cos(junction.heading) - dz * Math.sin(junction.heading);
  return Math.abs(across) - junction.width / 2;
}

/** R17 — the junction PLATFORM, as a shape and as a plane.
 *
 * A built junction is one piece of graded ground: an area around the
 * meeting point, elongated along the main road because that is the road
 * that runs through, laid on the main road's own grade. Everything asks
 * these two functions — the compiler warps the road onto it, the terrain
 * field puts the ground under it, and the renderer stands the paving on
 * it — so nothing anywhere near a junction is ever on a surface of its
 * own invention. */
export type JunctionPlatform = {
  x: number;
  z: number;
  y: number;
  grade: { x: number; z: number };
  heading: number;
  width: number;
  reach: number;
};

/** How much a point lies inside the platform, 1 in the middle of it to 0
 * where the two roads have their own cross-sections back. The falloff is
 * measured on an ellipse — down the main road, and the mat plus a little
 * across it — so a junction is a place with a shape and not a disc stamped
 * on the map. The shape is LOPSIDED on purpose: the minor road overlaps
 * the main one only on the side it leaves toward, and flattening the
 * camber out of the road for thirty meters in the direction nothing is
 * happening is just thirty meters of bare road. */
export function junctionFlat(platform: JunctionPlatform, x: number, z: number): number {
  const dx = x - platform.x;
  const dz = z - platform.z;
  const along = dx * Math.sin(platform.heading) + dz * Math.cos(platform.heading);
  const across = dx * Math.cos(platform.heading) - dz * Math.sin(platform.heading);
  const reach = along >= 0 ? platform.reach : platform.reach * 0.42;
  const d = Math.hypot(along / reach, across / (platform.width * 0.85));
  // Full inside the core, then off over the last quarter: a junction has
  // an edge in life too, and a blend that runs for a hundred meters is a
  // road with no camber for a hundred meters. Hermite, not linear — the
  // ground reads this, and a crease in the ground is a fan of shading
  // radiating from the junction on any lit render.
  const t = clamp01((d - 0.72) / 0.4);
  return 1 - t * t * (3 - 2 * t);
}

/** R17 — the gravel DRAG-OUT: how much of the dirt road's surfacing has
 * been carried onto the sealed one here, 0..1. Every car that turns out of
 * an unsealed road drops what its tires picked up on the tarmac at the
 * mouth, and in life that smear is the most obvious thing about a junction
 * between the two. It belongs to the MOUTH, not to the whole platform —
 * a tarmac road tan for sixty meters is not a junction, it is a mess. */
export function junctionDust(platform: JunctionPlatform, x: number, z: number): number {
  const d = Math.hypot(x - platform.x, z - platform.z) / (platform.width * 1.15);
  if (d >= 1) return 0;
  return (1 - d) * (1 - d);
}

/** The platform's own surface height at a point — the main road's grade,
 * carried across the whole junction. */
export function junctionPlatformY(platform: JunctionPlatform, x: number, z: number): number {
  return platform.y + platform.grade.x * (x - platform.x) + platform.grade.z * (z - platform.z);
}
