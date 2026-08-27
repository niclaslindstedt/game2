// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R18 — the WATER, and the rules of nature it obeys. A landscape does not
// grow a separate stream at every point a road happens to want one. Water
// falls on high ground, collects, and runs downhill in ONE watercourse
// that gathers as it goes and ends where it can go no lower — a lake, a
// sea basin, or off the edge of the world. A road that meets water three
// times has met the same river three times.
//
// So the river is traced first, as water: it is born on the high ground
// above the highest crossing, it visits every place the road crosses it in
// DESCENDING order (water cannot climb), it widens as it goes (a river
// collects), it prefers the low ground between two points (water finds the
// valley), and it runs out into the lowest ground it can find. Only when
// two crossings are too far apart to be the same watercourse does a stage
// get a second river — a different valley, which is a thing that exists.
//
// The road's crossings are its ANCHORS: the generator decided where the
// stage fords or bridges water (R7/R13), and the river is routed through
// exactly those points at exactly the water level the road was built for.

import { createRng } from "../lib/prng.ts";

/** One place the road meets water, as the terrain field reports it. */
export type RiverAnchor = {
  x: number;
  z: number;
  /** Water surface height the road was built around, m. */
  waterY: number;
  /** Half-width of the water where the road crosses it, m. */
  halfWidth: number;
  /** How deep the channel is cut below its surface there, m. */
  depth: number;
  /** True when the road spans it rather than wading it. */
  bridged: boolean;
  /** Arc position of the crossing on the stage — how a streaming run
   * prunes the water it has driven past. */
  s: number;
};

export type RiverPoint = {
  x: number;
  z: number;
  y: number;
  halfWidth: number;
};

/** One watercourse: its centerline, source first, and the crossings that
 * anchored it. */
export type River = {
  points: RiverPoint[];
  anchors: RiverAnchor[];
  /** Crossings the land refused to join to this course — they belong to
   * other water and are traced separately. */
  rest: RiverAnchor[];
  depth: number;
  /** True when any of its crossings is bridged — the renderer draws the
   * big water darker, and the tooling reports it. */
  bridged: boolean;
};

/** Spacing along a traced river, meters. */
const STEP = 14;
/** Two crossings further apart than this are not the same river. */
const SAME_RIVER = 900;
/** How far the source runs above the first crossing, meters. */
const SOURCE_RUN = { min: 260, max: 460 };
/** ...and how far the mouth runs below the last one before it finds water
 * to end in, or gives up and ducks under the landscape. */
const MOUTH_RUN = { min: 380, max: 760 };
/** How far under the land a reach may run before joining two crossings
 * would mean cutting a gorge rather than following a valley, m. Past it
 * the two are on different water — which is what a watershed IS. */
const RIDGE = 9;
/** How much the channel widens per meter travelled — a river collects. */
const GATHER = 0.004;
/** Meander: how far the course sways off the direct line, and how long one
 * sway is, meters. */
const MEANDER = { amplitude: { min: 10, max: 26 }, wave: { min: 90, max: 200 } };
/** How hard the course is pulled toward lower ground against its heading
 * toward the next anchor, 0..1 — water finds the valley, but it still has
 * somewhere to be. */
const DOWNHILL_PULL = 0.4;
/** Clearance the water surface keeps under the surrounding ground, m —
 * the water is IN the landscape, never running along the top of it. */
const SINK = 0.4;

type Field = (x: number, z: number) => number;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Group crossings into watercourses: the highest one starts a river, and
 * each next one is the nearest crossing BELOW the one before it. A
 * crossing too far from the course it would join starts its own — a stage
 * big enough to hold two valleys is allowed two rivers, and no more than
 * the terrain earns. */
function groupAnchors(anchors: RiverAnchor[]): RiverAnchor[][] {
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
function downhill(field: Field, x: number, z: number): { x: number; z: number } | null {
  const probe = 26;
  const gx = field(x + probe, z) - field(x - probe, z);
  const gz = field(x, z + probe) - field(x, z - probe);
  const len = Math.hypot(gx, gz);
  if (len < 1e-3) return null;
  return { x: -gx / len, z: -gz / len };
}

/** Trace one watercourse through its anchors, with a source above the
 * first and a mouth below the last. */
function traceCourse(seed: number, anchors: RiverAnchor[], field: Field, lakeY: number): River {
  const rng = createRng((seed ^ (Math.round(anchors[0].s) * 2654435761)) >>> 0);
  const amplitude = rng.range(MEANDER.amplitude.min, MEANDER.amplitude.max);
  const wave = rng.range(MEANDER.wave.min, MEANDER.wave.max);
  const phase = rng.range(0, Math.PI * 2);
  const points: RiverPoint[] = [];
  let travelled = 0;
  let width = anchors[0].halfWidth;

  /** Add a point, swaying it off the course by the meander — the sway is
   * ALONG the course's normal, so a river bends without ever doubling back
   * on itself. */
  const push = (x: number, z: number, y: number, dirX: number, dirZ: number): void => {
    const sway = amplitude * Math.sin((travelled / wave) * Math.PI * 2 + phase);
    points.push({
      x: x - dirZ * sway,
      z: z + dirX * sway,
      y,
      halfWidth: width,
    });
  };

  // ── The source: uphill from the first crossing, narrowing to a trickle.
  {
    const head = anchors[0];
    const run = rng.range(SOURCE_RUN.min, SOURCE_RUN.max);
    const climb: RiverPoint[] = [];
    let x = head.x;
    let z = head.z;
    let y = head.waterY;
    for (let d = 0; d < run; d += STEP) {
      const grade = downhill(field, x, z);
      // Walk INTO the slope: upstream is uphill, by definition.
      const dx = grade ? -grade.x : Math.sin(phase);
      const dz = grade ? -grade.z : Math.cos(phase);
      x += dx * STEP;
      z += dz * STEP;
      // Going upstream the surface only ever RISES, and never above the
      // ground it is cut into. Ground that fails to rise is not upstream of
      // anything: the spring is here, and the climb ends.
      const ceiling = field(x, z) - SINK;
      const next = Math.min(ceiling, y + STEP * 0.05);
      if (next <= y) break;
      y = next;
      climb.push({ x, z, y, halfWidth: head.halfWidth });
    }
    // A stream narrows the further up it you go, whatever the climb turned
    // out to be — a spring is a trickle even when the crossing below it is
    // a river. Widths are laid on after the walk, when its length is known.
    for (let i = 0; i < climb.length; i++) {
      const up = (i + 1) / (climb.length + 1);
      climb[i].halfWidth = Math.max(1.4, head.halfWidth * (1 - up));
    }
    // Walked from the crossing outward, so the source is the far end.
    climb.reverse();
    for (const p of climb) points.push(p);
    // The spring itself sits under the ground: water is born from a hill,
    // not out of thin air.
    if (points.length > 0) points[0].y -= 2.2;
  }

  // ── Through the crossings, in the order the water meets them. The LAND
  // gets a vote on every link: two crossings with a ridge or a basin
  // between them are not the same water, whatever the map says, and the
  // course ends at the first one the ground refuses.
  let joined = 1;
  points.push({
    x: anchors[0].x,
    z: anchors[0].z,
    y: anchors[0].waterY,
    halfWidth: anchors[0].halfWidth,
  });
  width = anchors[0].halfWidth;
  for (let i = 1; i < anchors.length; i++) {
    const to = anchors[i];
    const from = anchors[i - 1];
    const total = Math.hypot(to.x - from.x, to.z - from.z);
    const leg: { x: number; z: number; y: number; w: number; dx: number; dz: number }[] = [];
    let x = from.x;
    let z = from.z;
    let level = from.waterY;
    let travelledLeg = 0;
    let refused = false;
    let guard = 0;
    while (guard++ < 400) {
      const toX = to.x - x;
      const toZ = to.z - z;
      const left = Math.hypot(toX, toZ);
      if (left <= STEP) break;
      const aimX = toX / left;
      const aimZ = toZ / left;
      const grade = downhill(field, x, z);
      // Water finds the valley — but it has an anchor to reach, so the
      // pull toward low ground only bends the course, never steers it.
      let dx = aimX + (grade ? grade.x * DOWNHILL_PULL : 0);
      let dz = aimZ + (grade ? grade.z * DOWNHILL_PULL : 0);
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      x += dx * STEP;
      z += dz * STEP;
      travelledLeg += STEP;
      const t = clamp(1 - left / Math.max(1, total), 0, 1);
      const ground = field(x, z);
      // The surface FOLLOWS THE GROUND down and never climbs — that is the
      // whole of the rule. What a reach cannot do is arrive at the next
      // crossing already BELOW the level the road there was built for (the
      // water would have to climb the last stretch to meet it), or run so
      // far under the land on the way that reaching it means cutting a
      // gorge. Either of those, and the two crossings are not on the same
      // water: the course ends here and the rest start their own.
      // The surface follows the ground DOWN and never climbs — but it also
      // never falls below the crossing it is running toward: standing
      // water is flat, so a hollow between two crossings is a POOL at the
      // downstream one's level, which is what a chain of tarns in a valley
      // actually is. What still ends a course is high ground: water does
      // not climb over a ridge to reach the next crossing, and two
      // crossings with one between them are on different water.
      level = Math.max(to.waterY, Math.min(level, ground - SINK));
      if (ground - level > RIDGE) {
        refused = true;
        break;
      }
      leg.push({
        x,
        z,
        y: level,
        w:
          from.halfWidth +
          (to.halfWidth - from.halfWidth) * t +
          (travelled + travelledLeg) * GATHER,
        dx,
        dz,
      });
    }
    if (refused) break;
    travelled += travelledLeg;
    for (const p of leg) {
      width = p.w;
      push(p.x, p.z, p.y, p.dx, p.dz);
    }
    width = to.halfWidth;
    points.push({ x: to.x, z: to.z, y: to.waterY, halfWidth: to.halfWidth });
    joined = i + 1;
  }

  // ── The mouth: downhill until the water finds water, or the landscape
  // swallows it. This is where a river is ALLOWED to leave the map.
  {
    const tail = anchors[joined - 1];
    const run = rng.range(MOUTH_RUN.min, MOUTH_RUN.max);
    let x = tail.x;
    let z = tail.z;
    let y = tail.waterY;
    // Below every crossing it has taken, the river is at least as big as
    // the biggest of them: water that has gathered does not un-gather.
    width = Math.max(width, ...anchors.slice(0, joined).map((a) => a.halfWidth));
    for (let d = 0; d < run; d += STEP) {
      const grade = downhill(field, x, z);
      const dx = grade ? grade.x : -Math.sin(phase);
      const dz = grade ? grade.z : -Math.cos(phase);
      x += dx * STEP;
      z += dz * STEP;
      travelled += STEP;
      width += STEP * GATHER;
      const ground = field(x, z);
      y = Math.min(y, ground - SINK);
      push(x, z, y, dx, dz);
      // It reached standing water: the lake IS the end of the river.
      if (ground < lakeY + 1) break;
    }
    if (points.length > 0) points[points.length - 1].y -= 2.2;
  }

  const used = anchors.slice(0, joined);

  // Water never climbs: one forward pass settles any rise the terrain
  // pulled into the course. The legs above already hold themselves between
  // the levels their crossings were built for, so this only ever trims the
  // source and the mouth.
  for (let i = 1; i < points.length; i++) {
    if (points[i].y > points[i - 1].y) points[i].y = points[i - 1].y;
  }

  return {
    points,
    anchors: used,
    depth: Math.max(...used.map((a) => a.depth)),
    bridged: used.some((a) => a.bridged),
    /** Crossings this course could not reach — the caller traces them as
     * their own water. */
    rest: anchors.slice(joined),
  };
}

/** Trace every watercourse the road's crossings imply. Deterministic in
 * the seed and the crossings' positions. */
export function traceRivers(
  seed: number,
  anchors: RiverAnchor[],
  field: Field,
  lakeY: number,
): River[] {
  if (anchors.length === 0) return [];
  const rivers: River[] = [];
  // Grouping proposes; the ground disposes. A course that the land refuses
  // to carry all the way hands its remaining crossings back, and they get
  // a watercourse of their own.
  const pending = groupAnchors(anchors);
  let guard = 0;
  while (pending.length > 0 && guard++ < 64) {
    const course = pending.shift() as RiverAnchor[];
    const river = traceCourse(seed, course, field, lakeY);
    rivers.push(river);
    if (river.rest.length > 0) pending.push(river.rest);
  }
  return rivers;
}
