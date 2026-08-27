// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R16 — the road's CROSS-SECTION: what the ribbon looks like across its
// width, and how the ground falls away beside it. A rally road is not a
// flat carpet ruled onto the landscape. Cars have driven it: two worn
// tracks run down it where every one of them puts its wheels, the loose
// gravel they push aside piles at the edges, and the whole surface is
// crowned so water runs off it. Asphalt is laid ON the ground rather than
// cut into it, so the mat stands proud of the verge with its chippings
// spilled down the edge — and past the shoulder, on both, a ditch takes
// the water away.
//
// One module, three consumers, one shape: the renderer builds the ribbon
// from these numbers, the terrain field beside the road reads the same
// verge profile, and the physics rides it. Change a number here and all
// three move together — which is the whole reason it is not three sets of
// numbers in three files.

import type { Surface } from "./compile.ts";

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

  /** Beside the road: a flat shoulder, then the ditch, then the climb back
   * to the landscape. Distances are from the road EDGE; `depth` is below
   * the mat's own base. */
  verge: {
    shoulder: 0.25,
    ditchFrom: 1.4,
    ditchAt: 3.6,
    ditchTo: 6.6,
    depth: 0.85,
  },

  /** How far past the road edge the ribbon's own geometry reaches — the
   * shoulder, the ditch and the outer lip belong to the ROAD mesh, which
   * is sampled every 2 m along the stage, not to the 14 m ground lattice
   * that could never hold a ditch. Beyond it the landscape takes over. */
  reach: 7,
} as const;

function sq(v: number): number {
  return v * v;
}

/** Which cross-section a sample wears. A ford is flat water and a bridge
 * deck is flat concrete or plank — neither is bladed, rutted, or crowned
 * like a road that gets graded. */
function shapeOf(surface: Surface, bridge: boolean): "gravel" | "asphalt" | "deck" {
  if (bridge || surface === "water") return "deck";
  return surface === "asphalt" ? "asphalt" : "gravel";
}

/** Height of the DRIVEN surface at lateral offset `lateral` (m, signed
 * from the centerline), relative to the sample's own elevation — which is
 * the road's height on the crown, so this only ever falls away. Inside the
 * road only; past the edge, `vergeOffset` takes over. */
export function crossOffset(
  surface: Surface,
  bridge: boolean,
  lateral: number,
  width: number,
): number {
  const shape = shapeOf(surface, bridge);
  const half = width / 2;
  const t = Math.min(1, Math.abs(lateral) / half);
  let y = -ROAD_CROSS.crown[shape] * t * t;
  const depth = ROAD_CROSS.rut.depth[shape];
  if (depth > 0) {
    // Two tracks, each a soft trough — a hard-edged groove would be a rail
    // the car steers against instead of a line it settles into.
    const from = Math.abs(lateral) - ROAD_CROSS.rut.at * half;
    y -= depth * Math.exp(-sq(from / ROAD_CROSS.rut.width));
  }
  if (shape === "gravel" && t > ROAD_CROSS.berm.from) {
    y += ROAD_CROSS.berm.height * ((t - ROAD_CROSS.berm.from) / (1 - ROAD_CROSS.berm.from));
  }
  return y;
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
 * mat's edge, the shoulder, the ditch, and the lip where the landscape
 * takes over. `out` is meters past the road EDGE; `lift` is how proud the
 * mat stands there (0 on gravel, up to `asphaltLift` on a paved run). */
export function vergeOffset(out: number, lift: number, edgeY: number): number {
  const v = ROAD_CROSS.verge;
  // Off the mat: the edge falls to the shoulder over the chamfer — a step
  // on asphalt, barely anything on gravel.
  const base = -lift - v.shoulder;
  if (out <= ROAD_CROSS.chamfer) {
    const t = out / ROAD_CROSS.chamfer;
    return edgeY + (base - edgeY) * t * t * (3 - 2 * t);
  }
  if (out <= v.ditchFrom) return base;
  if (out <= v.ditchAt) {
    const t = (out - v.ditchFrom) / (v.ditchAt - v.ditchFrom);
    return base - (lift + v.depth) * (1 - Math.cos(t * Math.PI)) * 0.5;
  }
  if (out <= v.ditchTo) {
    const t = (out - v.ditchAt) / (v.ditchTo - v.ditchAt);
    const bottom = base - (lift + v.depth);
    return bottom + (base - bottom) * (1 - Math.cos(t * Math.PI)) * 0.5;
  }
  return base;
}

/** The whole corridor profile in one call: inside the road it is the
 * driven surface, outside it the verge. Distance is SIGNED lateral so the
 * two halves of the road can differ; `width` is the full road width. */
export function corridorOffset(
  surface: Surface,
  bridge: boolean,
  lateral: number,
  width: number,
  lift: number,
): number {
  const half = width / 2;
  const out = Math.abs(lateral) - half;
  if (out <= 0) return crossOffset(surface, bridge, lateral, width);
  // A deck has no verge at all — past the parapet is air, and the ground
  // under it is the channel the terrain carved.
  if (bridge) return -lift - 0.4;
  return vergeOffset(out, lift, crossOffset(surface, bridge, half, width));
}

/** R17 — the THROAT of a junction: the flared mouth that joins a side
 * road's mat to the main road's, laid over the strip of verge both roads
 * would otherwise have kept between them. Returned as flat quads in the
 * ground plane (the caller puts them at the junction's grade), so the
 * renderer and the preview tooling draw the same shape.
 *
 * The flare is what makes a junction read as built rather than collided:
 * every side road on earth opens wider where it meets the road it joins,
 * because that is the shape a vehicle turning into it actually needs. */
export function junctionThroat(junction: {
  x: number;
  z: number;
  heading: number;
  mouth: number;
  reach: number;
}): [number, number][][] {
  const bx = Math.sin(junction.heading);
  const bz = Math.cos(junction.heading);
  const nx = Math.cos(junction.heading);
  const nz = -Math.sin(junction.heading);
  // How far back INTO the main road the throat starts: past its
  // centerline, so the two surfaces meet with no seam anywhere between
  // them. (`reach` is the main road's half-width plus the flare, so this
  // is a meter past the middle of it.)
  const back = junction.reach - 5;
  /** Half-width the throat has settled to by the time it is just the side
   * road again. */
  const settled = junction.mouth - 7;
  const steps = 5;
  const at = (t: number): { x: number; z: number; w: number } => {
    const along = -back + (junction.reach + back) * t;
    // Eased so the mouth opens as a curve, not a wedge.
    const w = settled + (junction.mouth - settled) * (1 - t) * (1 - t);
    return { x: junction.x + bx * along, z: junction.z + bz * along, w };
  };
  const quads: [number, number][][] = [];
  for (let i = 0; i < steps; i++) {
    const a = at(i / steps);
    const b = at((i + 1) / steps);
    quads.push([
      [a.x + nx * a.w, a.z + nz * a.w],
      [b.x + nx * b.w, b.z + nz * b.w],
      [b.x - nx * b.w, b.z - nz * b.w],
      [a.x - nx * a.w, a.z - nz * a.w],
    ]);
  }
  return quads;
}
