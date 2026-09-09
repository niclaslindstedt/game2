// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// READING THE COUNTRY a watercourse is being traced across: which way is
// downhill, whether a point has left the world, whether the walk is on a
// crest it should not be crossing, how a course steps over the road and
// away from it again, and how a tail with nowhere lower to go is flattened
// into a pool. Every one is a question about the ground rather than a
// decision about the river — the decisions are `river.ts`'s.

import {
  CROSS_WINDOW,
  END_SINK,
  OFF_MAP,
  POOL_FILL,
  POOL_POINTS,
  POOL_SPREAD,
  PUSH_GRACE,
  ROAD_KEEP,
  SAME_RIVER,
  STEP,
  type Field,
  type RiverAnchor,
  type RiverPoint,
  type RoadClear,
  type WorldBounds,
} from "./river-shape.ts";

export function sinkEnd(end: number, neighbour: number): number {
  return Math.min(END_SINK, Math.max(0, Math.abs(end - neighbour) / 2));
}

export function offMap(b: WorldBounds, x: number, z: number): boolean {
  return (
    x < b.minX - OFF_MAP || x > b.maxX + OFF_MAP || z < b.minZ - OFF_MAP || z > b.maxZ + OFF_MAP
  );
}

/** Flatten the tail of a course into a POOL: standing water in the lowest
 * ground it reached, spreading as it fills. What water with nowhere left to
 * run actually does — a tarn at the head of a dead valley — and the one
 * ending that needs no lake to already be there.
 *
 * The level is the LOWEST the walk got to, not the last point's: the tail
 * may have climbed a little out of the hollow it should be sitting in, and
 * standing water is flat. */
export function poolAt(
  points: RiverPoint[],
  from: number,
  width: number,
  cap: number,
  roadClear: RoadClear,
): void {
  const tail = points.slice(from);
  if (tail.length === 0) return;
  let level = Infinity;
  for (const p of tail) level = Math.min(level, p.y);
  // The pool is the last stretch of the walk, widening into the hollow —
  // and only the hollow: it reaches back up the walk while the ground it
  // was walked over is still within `POOL_FILL` of its level.
  let start = tail.length;
  while (start > 0 && tail.length - start < POOL_POINTS && tail[start - 1].y - level <= POOL_FILL) {
    start--;
  }
  const spread = tail.length - start;
  for (let i = start; i < tail.length; i++) {
    const t = (i - start + 1) / spread;
    tail[i].y = level;
    // ...and it spreads no further than the road beside it allows. The
    // walk kept its channel `ROAD_KEEP` off the road; a tarn that widens
    // to the cap beside one is water back on the ground the road stands
    // on, and `water.road` reports it as the course running at the road.
    const room = roadClear(tail[i].x, tail[i].z) - ROAD_KEEP;
    tail[i].halfWidth = Math.max(
      tail[i].halfWidth,
      Math.min(cap, room, width * (1 + t * (POOL_SPREAD - 1))),
    );
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Group crossings into watercourses: the highest one starts a river, and
 * each next one is the nearest crossing BELOW the one before it. A
 * crossing too far from the course it would join starts its own — a stage
 * big enough to hold two valleys is allowed two rivers, and no more than
 * the terrain earns. */
export function groupAnchors(anchors: RiverAnchor[]): RiverAnchor[][] {
  const left = [...anchors].sort((a, b) => b.waterY - a.waterY);
  const groups: RiverAnchor[][] = [];
  while (left.length > 0) {
    const course = [left.shift() as RiverAnchor];
    for (;;) {
      const from = course[course.length - 1];
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < left.length; i++) {
        // Water only ever runs DOWN: a crossing above the one we are at
        // belongs to a different course, or further up this one.
        if (left[i].waterY > from.waterY) continue;
        const d = Math.hypot(left[i].x - from.x, left[i].z - from.z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0 || bestD > SAME_RIVER) break;
      course.push(left.splice(best, 1)[0]);
    }
    groups.push(course);
  }
  return groups;
}

/** The direction the ground falls at a point, as a unit vector (or null on
 * ground flat enough that it has no opinion). */
export function downhill(field: Field, x: number, z: number): { x: number; z: number } | null {
  const probe = 26;
  const gx = field(x + probe, z) - field(x - probe, z);
  const gz = field(x, z + probe) - field(x, z - probe);
  const len = Math.hypot(gx, gz);
  if (len < 1e-3) return null;
  return { x: -gx / len, z: -gz / len };
}

/** THE GULLY, NOT THE SPUR. Which way is UPSTREAM from a point, as a unit
 * vector — the direction a source climbs.
 *
 * Steepest ascent is the wrong answer: every flank's gradient points at
 * the crest above it, so a walk that follows it converges on a ridge and
 * runs along the spur's crest, and a stream drawn there stands over BOTH
 * its banks. The taiga's hills are too broad to catch it; a massif's spurs
 * are sharp, and seven sources over two of the alpine's twelve seeds
 * floated by up to three metres. Water
 * comes DOWN a gully, so the walk goes up one: it reads a row of ground a
 * step ahead and heads for the lowest point in it. On a plain hillside the
 * row is level and the walk goes straight on; on a spur the row falls away
 * on both sides and the walk slides off the crest; in a gully the row's
 * floor is the gully's, and the walk stays in it.
 *
 * Two things about the row decide whether that works. It lies ALONG THE
 * CONTOUR — across the ascent, not across the walk's own heading — so its
 * lowest point is the cross-profile's floor and never a point that is
 * merely further downhill along the heading. And it is centred a step
 * along the walk's own last direction plus the ascent (`ux`, `uz`, any
 * length), never the ascent alone: from a point just off a crest the
 * ascent points back at the crest by about the shift the row buys, and a
 * walk laying its row from there hops the crest from side to side forever.
 *
 * Among the row's points that still stand over the ground HERE, the
 * lowest: a source only ever rises, and a point below this one is where
 * the climb ends (the ceiling in the walk), so it is taken only when
 * nothing in the row rises at all. `bias` is a tie-break toward straight
 * on, so level ground does not zig-zag on the noise in the field. */
export const GULLY_ROW = { half: 2, spacing: 8, bias: 0.05 };
export function upGully(
  field: Field,
  x: number,
  z: number,
  ux: number,
  uz: number,
  grade: { x: number; z: number } | null,
  stride: number,
): { x: number; z: number } {
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul;
  uz /= ul;
  // The contour: across the fall line where there is one, across the
  // heading where the ground is flat.
  const tx = grade ? grade.z : -uz;
  const tz = grade ? -grade.x : ux;
  const ax = x + ux * stride;
  const az = z + uz * stride;
  const here = field(x, z);
  let bestK = 0;
  let best = Infinity;
  let rises = false;
  for (let k = -GULLY_ROW.half; k <= GULLY_ROW.half; k++) {
    const ground = field(ax + tx * k * GULLY_ROW.spacing, az + tz * k * GULLY_ROW.spacing);
    const up = ground > here;
    if (rises && !up) continue;
    const score = ground + Math.abs(k) * GULLY_ROW.bias;
    if (up && !rises) {
      rises = true;
      best = Infinity;
    }
    if (score < best) {
      best = score;
      bestK = k;
    }
  }
  const dx = ax + tx * bestK * GULLY_ROW.spacing - x;
  const dz = az + tz * bestK * GULLY_ROW.spacing - z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/** A SOURCE NEVER STANDS ON A CREST. True where the contour through a
 * point falls away on both sides of it by more than `CREST_DROP` over the
 * row's half-width — a spur, a knoll, a ridge — which is ground water runs
 * OFF, not along. Read at the row's reach and not one spacing in, because
 * a whaleback is a crest too: the analyzer measures the banks out past the
 * channel's blend, and a walk along a spur that drops a quarter of a metre
 * in eight and a whole one in sixteen floats there.
 *
 * The row rule keeps a walk in the gully it is in; this is what ends the
 * walk that has run out of gully. A climb that starts deep under the land
 * (a ford in a cutting, a culvert's water in its valley floor, metres under
 * the road's own ground) has that much headroom before the ceiling binds,
 * and with it the walk climbed out of its gully's head and up the knoll
 * beside it, laying water along the top. The threshold is a real fold, not
 * the noise in the field: a gentle rise still ends where the ground stops
 * rising. */
export const CREST_DROP = 0.5;
export function onCrest(
  field: Field,
  x: number,
  z: number,
  grade: { x: number; z: number },
): boolean {
  const here = field(x, z);
  const out = GULLY_ROW.half * GULLY_ROW.spacing;
  const tx = grade.z * out;
  const tz = -grade.x * out;
  return field(x + tx, z + tz) < here - CREST_DROP && field(x - tx, z - tz) < here - CREST_DROP;
}

/** The way ACROSS the road at a crossing, as a unit vector: toward the side
 * the ground falls to (`down`), or the side it rises to.
 *
 * A walk leaving a crossing cannot be left to ask the ground which way is
 * down, because the ground at a crossing is the ROAD's. A road on an
 * embankment is a ridge — both sides fall away alike, the lateral
 * gradients cancel, and what is left is the road's own grade, so the
 * downhill from a point on the centerline runs ALONG the road. Inside the
 * crossing window nothing pushes the water off, so a mouth ran a hundred
 * metres down the verge before the push could win, carving the ground out
 * from beside the embankment as it went; a source did the same uphill. The
 * water crosses the road where the road crosses the water, and it gets off
 * the road the way a stream does: straight across it. */
export function acrossRoad(field: Field, a: RiverAnchor, down: boolean): { x: number; z: number } {
  const nx = Math.cos(a.heading);
  const nz = -Math.sin(a.heading);
  const probe = 26;
  const right = field(a.x + nx * probe, a.z + nz * probe);
  const left = field(a.x - nx * probe, a.z - nz * probe);
  const side = right < left === down ? 1 : -1;
  return { x: nx * side, z: nz * side };
}

/** How much of a walk's step is the way ACROSS the road it is leaving,
 * rather than its own steering, `travelled` metres out of the crossing:
 * all of it at the crossing — the first step is straight across, so the
 * sheet it draws lies off the road's aprons — and none by the end of the
 * crossing window. */
export function leaving(travelled: number): number {
  if (travelled >= CROSS_WINDOW) return 0;
  const t = 1 - travelled / CROSS_WINDOW;
  return t * t;
}

/** One step's direction: the walk's own steering blended with the way
 * across the road by `out` (`leaving`), as a unit vector. */
export function stepAcross(
  sx: number,
  sz: number,
  across: { x: number; z: number },
  out: number,
): { x: number; z: number } {
  const len = Math.hypot(sx, sz) || 1;
  const dx = (sx / len) * (1 - out) + across.x * out;
  const dz = (sz / len) * (1 - out) + across.z * out;
  const n = Math.hypot(dx, dz) || 1;
  return { x: dx / n, z: dz / n };
}

/** The way OFF a road at a point, as a unit vector — the direction road
 * clearance grows fastest. Null where the road is already far enough away
 * to have no opinion, or where the clearance field is flat (nothing near
 * enough to measure a gradient against). */
export function awayFromRoad(
  roadClear: RoadClear,
  x: number,
  z: number,
  need: number,
): { x: number; z: number } | null {
  if (roadClear(x, z) >= need) return null;
  const probe = 12;
  const gx = roadClear(x + probe, z) - roadClear(x - probe, z);
  const gz = roadClear(x, z + probe) - roadClear(x, z - probe);
  const len = Math.hypot(gx, gz);
  if (!Number.isFinite(len) || len < 1e-3) return null;
  return { x: gx / len, z: gz / len };
}

/** One walk's memory of a road it is being pushed off: hands back true
 * once the road has ended the walk, either because the water is ON it or
 * because the push has failed to clear it for PUSH_GRACE steps. */
export function roadBlock(): { hit: (clear: number, need: number) => boolean; inside: number } {
  const state = {
    /** How many consecutive steps the walk has been inside the keep-out. */
    inside: 0,
    hit(clear: number, need: number): boolean {
      state.inside = clear < need ? state.inside + 1 : 0;
      return clear < 0 || state.inside > PUSH_GRACE;
    },
  };
  return state;
}

/** True where a walk has come back onto ground it has already covered.
 *
 * Water does not run back over itself. A course that returns to a point it
 * has already left is not meandering, it is STUCK: two neighbouring cells
 * the steering swaps between — one pulling the walk downhill, the other
 * shoving it off a road — with the surface frozen at the floor of the
 * hollow they share. Nothing else can end it, so it spends its whole
 * budget on one spot and lays four hundred points and a full-width sheet
 * of water there: a lake nobody poured, standing over whatever the road
 * was doing underneath. Seed 21 drew one 30 m from the stage and put 44 m
 * of road under water.
 *
 * What water with nowhere left to run actually does is stand, so the walk
 * stops and the ending it already has for that case takes over: a POOL for
 * a mouth, and for a reach between two crossings the same answer a ridge
 * gets — they are not the same water.
 *
 * The last two steps are exempt: a step is `STEP` long and a bend inside
 * its own length is a bend, not a return. */
export function retraces(trail: { x: number; z: number }[], x: number, z: number): boolean {
  for (let i = 0; i < trail.length - 2; i++) {
    if (Math.hypot(trail[i].x - x, trail[i].z - z) < STEP * 0.75) return true;
  }
  return false;
}

/** Drop the tail of a walk that ended against a road: the grace steps are
 * the push TRYING, and when the push has failed those steps are water that
 * was laid inside the corridor. Keeping them is the whole of the "a river
 * runs down the road" bug — the walk stops in the right place and leaves
 * fifty metres of channel cut through the ground the ribbon stands on. */
export function trimToRoad(points: RiverPoint[], from: number, inside: number): void {
  const drop = Math.min(inside, points.length - from);
  if (drop > 0) points.length -= drop;
}

/** Trace one watercourse through its anchors, with a source above the
 * first and a mouth below the last. */
