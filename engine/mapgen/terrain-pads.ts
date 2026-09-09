// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GROUND SOMEBODY LEVELLED. Most of the landscape is the country plus the
// road's own earthworks, but four things are FLAT because a person made
// them flat: a homestead's yard (R37), every lot of a town and the band
// the whole village stands on (R39), a crane pad under a turbine and a car
// park's apron (R42, R43). Each is a disc or a rectangle graded to a
// plane, eased back onto the country over a rim no steeper than a car can
// climb — and each is also a place the forest, the water and the props
// keep off, which is the other half of what this answers.

import { smooth } from "../lib/noise.ts";
import type { Track } from "./compile.ts";
import { rectDistance, type FarmRect } from "./farms.ts";
import type { Surface } from "./compile.ts";
import type { TownPlatform } from "./towns.ts";
import { spurReach, type SpurLine } from "./spurs.ts";
import { clamp01 } from "./terrain-streams.ts";
import type { Cone } from "./terrain-cone.ts";

export type PadField = ReturnType<typeof createPadField>;

/** The pads of one stage. Everything here is filled by the field's own
 * ingest (`sync`) as the stage streams, so the arrays come back live. */
export function createPadField(track: Track, cone: Cone) {
  const { CLIMBABLE, holdOf, lipAt } = cone;
  const samples = track.samples;
  /** R37 + R39 — the PADS: discs of graded ground the landscape is
   * flattened to. A homestead's yard (its DRIVE goes into the branch index
   * above — it is a road, and gets a road's shelf) and every lot of a
   * town. Each carries its own `blend`: a yard out in a field is eased back
   * onto the country over a long rim, a lot on a village street over a
   * short one, because the next lot is a few metres away. Same ingest
   * cursor discipline as the branches. */
  const pads: {
    x: number;
    z: number;
    y: number;
    radius: number;
    blend: number;
    /** The plane the pad is graded to, m per m: level for a yard, the
     * street's own fall for a lot on one. */
    grade: { x: number; z: number };
    /** How far the TILES duck under `y` here, m. A yard, a car park and a
     * crane pad are drawn as their own disc over the tiles the way a road
     * is drawn over them, and duck by the tile clearance; a town's lot is
     * a patch of gravel PAINTED on ground its whole village is graded
     * level with (R39's platform), so its tiles are the surface and there
     * is nothing to duck under. */
    sink: number;
    /** Where on the stage it belongs, for the endless prune. */
    atS: number;
  }[] = [];
  /** R31 — A RIM IS A SLOPE A CAR CAN CLIMB. A pad or a village's band is
   * eased back onto the country over its `blend` at least, and over more
   * wherever the country stands far enough over or under it that the
   * blend would make a wall of the rim: a smoothstep's steepest point is
   * one and a half times its mean, so the run a drop needs is that over
   * `verge.climbable`. A yard on a flat keeps its eleven metres; a village
   * graded into a hillside twenty metres below the ground behind its back
   * gardens gets a bank fifty metres wide instead of a cliff — which is
   * what the back of a hillside village is. `RIM_MAX` bounds it, and is
   * the reach a pad is rejected by. */
  const RIM_RUN = 1.5 / CLIMBABLE;
  const RIM_MAX = 120;
  const rimOf = (blend: number, drop: number): number =>
    Math.min(RIM_MAX, Math.max(blend, Math.abs(drop) * RIM_RUN));

  /** How much of a pad's level applies at a point — 1 on the pad, fading
   * to 0 over its rim past its radius — and the level itself. `ground` is
   * what the rim eases onto, which is what sizes it. Where two
   * pads reach the same point (a street's lots overlap at their rims) the
   * nearest pad's level holds on the pad itself and gives way to the
   * others' only through its rim, so a row of lots on a grade is a row of
   * level pads with a shallow step in each gap, and never a face where two
   * discs meet — nor a lot that leans toward its neighbour. Null anywhere
   * no pad reaches. */
  const padAt = (x: number, z: number, ground: number): { y: number; weight: number } | null => {
    let weight = 0;
    let level = 0;
    let othersSum = 0;
    let othersWeight = 0;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const reach = pad.radius + RIM_MAX;
      const dx = x - pad.x;
      const dz = z - pad.z;
      if (dx * dx + dz * dz >= reach * reach) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const here = pad.y - pad.sink + pad.grade.x * dx + pad.grade.z * dz;
      const w = 1 - smooth(clamp01((d - pad.radius) / rimOf(pad.blend, here - ground)));
      if (w <= 0) continue;
      if (w > weight) {
        if (weight > 0) {
          othersSum += level * weight;
          othersWeight += weight;
        }
        weight = w;
        level = here;
      } else {
        othersSum += here * w;
        othersWeight += w;
      }
    }
    if (weight <= 0) return null;
    if (othersWeight <= 0) return { y: level, weight };
    return { y: level * weight + (othersSum / othersWeight) * (1 - weight), weight };
  };
  /** R39 — THE VILLAGE PLATFORMS: one band of graded ground per town, laid
   * along its street and reaching past the back of its deepest lot on each
   * side (`towns.ts` sizes it). Not a pad, and not a wider pad either: a
   * pad is a disc narrower than the ground lattice, and the whole point of
   * a band hundreds of metres long is that the lattice's corners actually
   * fall inside it, so the flattening reaches the surface the houses stand
   * on instead of falling between the corners. */
  type Platform = TownPlatform & {
    /** The band's bounding box with its rim, for a cheap rejection. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** WHICH ROAD the street is — the route's own arc where the town stands
     * on the run the rally borrows, the branch where it stands along an
     * abandoned arm. The band owns the ground under its own street (that is
     * what stops the lattice under the mat pulling the ground beside a
     * front wall about) and yields it under every other road. */
    routeSpan: { fromS: number; toS: number } | null;
    streetSpur: SpurLine | null;
    /** Where on the stage it belongs, for the endless prune. */
    atS: number;
  };
  const platforms: Platform[] = [];
  /** The nearest piece of any village's band to a point: the two spine
   * points it lies between and how far along, how far out it is, on which
   * side, and how far the band reaches THERE. Null where no band is near.
   *
   * The nearest by DISTANCE, and that matters: a band forty metres wide is
   * at full weight against a hundred metres of its own spine at once, so
   * picking the strongest claim instead picks whichever piece of street the
   * walk reached first — and grades the ground behind one house to the level
   * of the street three hundred metres back, which is a metre of the
   * street's own fall taken as a step in the middle of the village. */
  const nearestBand = (
    x: number,
    z: number,
  ): {
    band: Platform;
    a: Platform["spine"][number];
    b: Platform["spine"][number];
    /** How far along the segment, 0..1. */
    t: number;
    /** Distance to the segment, m — to the SEGMENT and not across it, so a
     * band ends in a rounded cap past its last point instead of running on
     * down the street's own bearing for ever. */
    d: number;
    /** Signed offset across the street, m: positive on its own right. */
    lat: number;
    /** How far the band reaches on that side here, m. */
    out: number;
  } | null => {
    let best = Infinity;
    let hit = null as {
      band: Platform;
      a: Platform["spine"][number];
      b: Platform["spine"][number];
      t: number;
      d: number;
      lat: number;
      out: number;
    } | null;
    for (let i = 0; i < platforms.length; i++) {
      const band = platforms[i];
      if (x < band.minX || x > band.maxX || z < band.minZ || z > band.maxZ) continue;
      for (let k = 0; k + 1 < band.spine.length; k++) {
        const a = band.spine[k];
        const b = band.spine[k + 1];
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const len2 = ex * ex + ez * ez;
        if (len2 <= 0) continue;
        let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const dx = x - (a.x + ex * t);
        const dz = z - (a.z + ez * t);
        const d = Math.hypot(dx, dz);
        if (d >= best) continue;
        best = d;
        // Which side of the street: the street's own right is (ez, -ex) —
        // the same turn `towns.ts` takes to put a lot on a side, so `right`
        // here is the side the record calls right.
        const lat = (dx * ez - dz * ex) / Math.sqrt(len2);
        const out =
          lat >= 0
            ? a.outRight + (b.outRight - a.outRight) * t
            : a.outLeft + (b.outLeft - a.outLeft) * t;
        hit = { band, a, b, t, d, lat, out };
      }
    }
    return hit;
  };

  /** The level a town's band grades the ground to at a point and how much
   * of it applies there — 1 inside the band, fading to 0 over its rim
   * (sized against `ground`, what the rim eases onto — see `rimOf`), and
   * null where no band reaches. */
  const platformAt = (
    x: number,
    z: number,
    ground: number,
  ): { y: number; weight: number; band: Platform } | null => {
    const hit = nearestBand(x, z);
    if (hit === null) return null;
    const { band, a, b, t, d, lat, out } = hit;
    if (d - out >= RIM_MAX) return null;
    // The two verges' levels, crossed over between them, so the band is one
    // continuous plane from one side of the street to the other.
    const toRight = smooth(clamp01((lat + band.lip) / (2 * band.lip)));
    const right = a.right + (b.right - a.right) * t;
    const left = a.left + (b.left - a.left) * t;
    const y = left + (right - left) * toRight;
    const weight = 1 - smooth(clamp01((d - out) / rimOf(band.blend, y - ground)));
    if (weight <= 0) return null;
    return { y, weight, band };
  };

  /** R23 + R31 — how much of a point inside a village's band the band is
   * still allowed to shape: all of it out in the country and on its own
   * street, none of it inside any OTHER road's drawn corridor, handed back
   * over the same lattice cell the corridor hands over across.
   *
   * A road stands on its own shelf, and a village's level laid across one
   * walls its edge in at over a metre per metre — which is exactly what
   * R31's cone exists to take down. The placer keeps the band off the roads
   * it can see (`bandOut`), and this is what covers the ones it cannot: a
   * town is stood the moment its piece of tarmac closes, and the route it
   * is graded beside may not be built for another three hundred metres. */
  const bandHold = (
    band: Platform,
    near: { d: number; index: number } | null,
    spur: { d: number; spur: SpurLine } | null,
  ): number => {
    let hold = 1;
    if (near !== null) {
      const s = samples[near.index].s;
      const own = band.routeSpan !== null && s >= band.routeSpan.fromS && s <= band.routeSpan.toS;
      if (!own) hold *= 1 - holdOf(near.d, lipAt(near.index));
    }
    if (spur !== null && spur.spur !== band.streetSpur) {
      hold *= 1 - holdOf(spur.d, spurReach(spur.spur));
    }
    return hold;
  };

  /** R39 — distance from a point to the nearest village's graded ground, m,
   * negative inside it; Infinity when there is no town near. What the
   * watercourses steer by, for the reason they steer round a road: a stream
   * through a village street is a village street standing in a stream, and
   * a channel cut through the band leaves the houses beside it hanging over
   * a gully. */
  const platformClearance = (x: number, z: number): number => {
    const hit = nearestBand(x, z);
    return hit === null ? Infinity : hit.d - hit.out;
  };

  /** Distance from a point to the nearest yard's rim, m — negative on the
   * pad, Infinity when there is none near. */
  const padClearance = (x: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const d = Math.hypot(x - pad.x, z - pad.z) - pad.radius;
      if (d < best) best = d;
    }
    return best;
  };
  /** R37 — the CLEARINGS: a farm's paddock and its field. Not pads — the
   * ground under them is the country's own, a meadow lies on a slope — but
   * ground the forest and the scatter keep off, and (a ploughed field)
   * ground with a surface of its own. Read through `spurClearance` like
   * everything else that is not forest, so one function still answers
   * "may anything stand here". */
  const clearings: { rect: FarmRect; surface: Surface | null; atS: number }[] = [];
  const clearingAt = (x: number, z: number): { d: number; surface: Surface | null } => {
    let best = Infinity;
    let surface: Surface | null = null;
    for (let i = 0; i < clearings.length; i++) {
      const c = clearings[i];
      // A cheap box first: a rect's reach is its half-diagonal.
      const reach = Math.hypot(c.rect.width, c.rect.depth) / 2 + 1;
      if (Math.abs(x - c.rect.x) > reach || Math.abs(z - c.rect.z) > reach) continue;
      const d = rectDistance(c.rect, x, z);
      if (d < best) {
        best = d;
        surface = c.surface;
      }
    }
    return { d: best, surface };
  };

  /** Anything with a road's cross-section: a stage sample or a branch's
   * (the branch has no bridges, so its deck is simply absent). */

  /** The corridor's own cross-section at a SIGNED lateral offset from a
   * road's center: the mat's crown and wheel tracks inside the edge, its
   * shoulder and the ground leaning away outside it (road.ts). One function
   * for the stage road and for an abandoned branch — they are the same kind
   * of thing.
   *
   * The offset is signed because the corridor is not symmetric: a banked
   * corner (R19) tilts the whole cross-section by `-bank * lateral`, so the
   * outside of the turn rides metres proud of the inside. Handing this an
   * unsigned DISTANCE banks both verges the same way, and then one side of
   * every corner is drawn a metre away from where the physics rides it —
   * which is a car that sinks into the ground beside the road. */
  return {
    pads,
    rimOf,
    padAt,
    platforms,
    nearestBand,
    platformAt,
    bandHold,
    platformClearance,
    padClearance,
    clearings,
    clearingAt,
    RIM_MAX,
  };
}
