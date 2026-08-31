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
//
// And it meets the road THERE AND NOWHERE ELSE. Two crossings are joined
// by a reach that keeps clear of the corridor between them, because this
// generator has no culverts: water routed under a road it does not cross
// digs the ground out from under the ribbon and leaves the road standing
// on a bank of nothing, with a sheet of water drawn through it.

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
  /** HOW IT ENDS. `water` ran into a lake or a sea basin, `map` left the
   * country, `pool` had nowhere lower to go and stands where it stopped.
   * Those are the only three: a watercourse that simply STOPS is the thing
   * this field exists to make impossible to ship unnoticed. */
  endsAt: "water" | "map" | "pool";
};

/** Spacing along a traced river, meters. */
const STEP = 14;
/** Two crossings further apart than this are not the same river. */
const SAME_RIVER = 900;
/** How far the source runs above the first crossing, meters. */
const SOURCE_RUN = { min: 260, max: 460 };
/** ...and how far the mouth runs below the last crossing looking for water
 * to end in. A river ENDS SOMEWHERE — in a lake, in a sea basin, or off the
 * edge of the world — so the walk is not a fixed run that stops wherever it
 * has got to: it keeps going until it finds one of those. `min` is only how
 * far it goes before it is allowed to consider having left the map, and
 * `max` is the guard against a walk that never terminates, which is a
 * landscape with a closed basin in it rather than a bug. A course that hits
 * the guard is drawn ending in a POOL — flat water in the lowest ground it
 * reached — because that is what water with nowhere to go actually does. */
const MOUTH_RUN = { min: 380, max: 1800 };
/** How far outside the stage's own country a mouth has to get before
 * running off the map counts as having ended somewhere, m. Past the fog
 * ceiling, like a branch's escape (`SPUR.escape`), so it is never seen
 * ending. */
const OFF_MAP = 140;
/** A POOL: how many points of the mouth's tail are flattened into standing
 * water, and how much wider than the river it spreads. A river's worth of
 * water sitting in a hollow is a tarn, not a puddle. */
const POOL_POINTS = 6;
const POOL_SPREAD = 2.6;
/** How far under the land a reach may run before joining two crossings
 * would mean cutting a gorge rather than following a valley, m. Past it
 * the two are on different water — which is what a watershed IS. */
const RIDGE = 9;
/** ...and how far a reach's surface may stand ABOVE the ground on the way,
 * m. Standing water between two crossings is a pool and belongs there; a
 * pool deeper than this is a hollow the road's own water level could never
 * have filled, so what would be drawn is a sheet of water lying across a
 * valley. Two crossings either side of one are on different water. */
const POOL_DEPTH = 2.5;
/** How much the channel widens per meter travelled — a river collects. */
const GATHER = 0.004;
/** ...and the widest half-width a WATERCOURSE ever reaches, m. Past this it
 * is not a river any more, it is a lake, and a lake is the landscape's job
 * (the basins in `geology.ts`) rather than a channel's. Without the cap a
 * long mouth gathers itself into a hundred-metre sheet of water that then
 * fails every clearance rule it meets, because a strip that wide cannot
 * keep away from anything. */
const MAX_WIDTH = 20;
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
/** Bank blend distance from the water's edge back to the landscape, m —
 * how far out from the water the channel is cut into the ground. */
export const BANK = 9;
/** Room a watercourse keeps between its own edge and a road's, m: the
 * bank it cuts, and then some. Inside this the carve would be eating the
 * ground the ribbon stands on. */
const ROAD_KEEP = BANK + 4;
/** ...and how much of a reach either end of it the rule lets go of, m. The
 * last stretch into a ford — or under a deck — is water running at a road
 * ON PURPOSE, and it has to be able to reach it. */
const CROSS_WINDOW = 40;
/** How hard a road pushes the course off it, against the anchor it is
 * steering for. Firmer than the valley's pull: a river bends toward low
 * ground, but it does not run down a road. */
const ROAD_PUSH = 2.2;
/** How many steps a walk may spend inside a road's keep-out before the
 * road is what ends it. A step or two is the push working — the course
 * bending back out of the corridor — and longer than this is water that
 * would have to run down the road to get where it is going. */
const PUSH_GRACE = 4;

/** How far a course's two ENDS are sunk under the level the walk gave them,
 * m: a spring comes out of a hillside and a mouth runs into what it joins,
 * so neither is drawn lying flat on the surface. */
const END_SINK = 2.2;
/** How far above the crossing it feeds a MADE spring is placed, m — the one
 * put there when the uphill walk found nothing to climb. Enough to be a
 * source rather than a second name for the crossing. */
const SPRING_RISE = 2.5;

/** ...and how much of that an end may actually take, given the level of the
 * point next to it. An end sunk PAST its neighbour inverts the course there,
 * and the downhill pass that closes the trace then drags everything below it
 * down to match — which puts the water at every crossing under its own bed.
 * So an end never takes more than half the fall it has. */
function sinkEnd(end: number, neighbour: number): number {
  return Math.min(END_SINK, Math.max(0, Math.abs(end - neighbour) / 2));
}

/** The country the stage occupies — a mouth that gets outside it by
 * `OFF_MAP` has left, which is one of the two honest ways for a river to
 * end. Optional: without one, the only ending is water. */
export type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

function offMap(b: WorldBounds, x: number, z: number): boolean {
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
function poolAt(points: RiverPoint[], from: number, width: number, cap: number): void {
  const tail = points.slice(from);
  if (tail.length === 0) return;
  let level = Infinity;
  for (const p of tail) level = Math.min(level, p.y);
  // The pool is the last stretch of the walk, widening into the hollow.
  const spread = Math.min(tail.length, POOL_POINTS);
  for (let i = tail.length - spread; i < tail.length; i++) {
    const t = (i - (tail.length - spread) + 1) / spread;
    tail[i].y = level;
    tail[i].halfWidth = Math.min(cap, width * (1 + t * (POOL_SPREAD - 1)));
  }
}

type Field = (x: number, z: number) => number;
/** Distance from a point to the nearest road's EDGE, m — negative on the
 * road itself, Infinity where no road is near. The water asks it before
 * committing to a step (R18). */
export type RoadClear = (x: number, z: number) => number;

/** R35 — what a course can sense of the water already standing on the
 * country. Both halves matter and they are not the same question: one is
 * "have I arrived", the other is "which way is there anything to arrive
 * AT". A tracer with only the first gropes downhill through the contours
 * of its own noise and runs out of length a couple of hundred metres short
 * of a lake it was never aimed at. */
export type StandingWater = {
  /** The surface of the standing water at or beside a point, m, or null on
   * dry ground — the lake, tarn or sea a course ends in, at its own
   * level. */
  levelAt: (x: number, z: number) => number | null;
  /** The nearest standing water within `within` metres, or null where
   * there is none in reach. */
  nearestAt: (
    x: number,
    z: number,
    within: number,
  ) => { x: number; z: number; level: number } | null;
};

/** How far a mouth looks for the water it is running to, m — its own run,
 * so it only ever aims at something it could actually reach. */
const MOUTH_REACH = 1400;
/** How hard it is pulled that way, against the local downhill (a unit
 * vector) and the road's push. Water runs downhill AND it runs to the sea;
 * this is the second of those, and it is deliberately weaker than the
 * road's shove so a course still bends out of a corridor rather than
 * ploughing down it toward the lake. */
const SEAWARD_PULL = 0.9;
/** How often the mouth re-asks where the water is, in steps. A fixed
 * destination for a stretch at a time keeps the course purposeful instead
 * of twitching at every cell boundary the answer crosses. */
const SEAWARD_REFRESH = 8;

/** No road anywhere: what a caller with no road to report hands in. */
const OPEN_COUNTRY: RoadClear = () => Infinity;

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

/** The way OFF a road at a point, as a unit vector — the direction road
 * clearance grows fastest. Null where the road is already far enough away
 * to have no opinion, or where the clearance field is flat (nothing near
 * enough to measure a gradient against). */
function awayFromRoad(
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
function roadBlock(): { hit: (clear: number, need: number) => boolean; inside: number } {
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
function retraces(trail: { x: number; z: number }[], x: number, z: number): boolean {
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
function trimToRoad(points: RiverPoint[], from: number, inside: number): void {
  const drop = Math.min(inside, points.length - from);
  if (drop > 0) points.length -= drop;
}

/** Trace one watercourse through its anchors, with a source above the
 * first and a mouth below the last. */
function traceCourse(
  seed: number,
  anchors: RiverAnchor[],
  field: Field,
  standingAt: StandingWater,
  roadClear: RoadClear,
  bounds: WorldBounds | undefined,
): River {
  const rng = createRng((seed ^ (Math.round(anchors[0].s) * 2654435761)) >>> 0);
  const amplitude = rng.range(MEANDER.amplitude.min, MEANDER.amplitude.max);
  const wave = rng.range(MEANDER.wave.min, MEANDER.wave.max);
  const phase = rng.range(0, Math.PI * 2);
  /** The widest this course may be drawn, m. The cap is about the GATHER
   * running away over a long mouth, not about crossings: a wide concrete
   * span asks for water as wide as the bridge, and clamping THAT draws a
   * channel narrower than the deck over it — which is a bridge with dry
   * ground under half of it. So the cap is lifted to whatever the widest
   * crossing on this course needs. */
  const cap = Math.max(MAX_WIDTH, ...anchors.map((a) => a.halfWidth));
  const points: RiverPoint[] = [];
  let travelled = 0;
  let width = Math.min(cap, anchors[0].halfWidth);
  /** The widest the course has been anywhere upstream — what every point is
   * actually drawn at, so a river never narrows as it runs. Capped from the
   * first anchor on: a wide BRIDGE can ask for a crossing wider than a
   * watercourse ever gets, and a spring that started wider than the mouth it
   * runs to is a river drawn backwards. */
  let widest = width;

  /** Add a point, swaying it off the course by the meander — the sway is
   * ALONG the course's normal, so a river bends without ever doubling back
   * on itself.
   *
   * The sway is the one thing here that can move a point WITHOUT moving the
   * level it carries, so it is also the one thing that can float water: a
   * course walked down a valley floor and then swayed twenty metres sideways
   * is swayed onto the valley's SIDE, and the surface it brought with it is
   * now standing above the ground. The level cannot be lowered to fix it —
   * the reaches are held between the levels their crossings were built for,
   * and dropping one drags every point below it down with it — so the SWAY
   * gives way instead: it is halved until the ground it lands on is high
   * enough to hold the water, and abandoned if it never is. A river bends
   * within its valley, which is what a meander is.
   *
   * The width carried is monotone. A course collects as it runs and does
   * not un-collect, and the anchors it passes through are of whatever size
   * the road wanted its crossing to be — so a big ford followed by a narrow
   * one must not narrow the river. */
  const push = (x: number, z: number, y: number, dirX: number, dirZ: number): void => {
    if (width > widest) widest = Math.min(cap, width);
    let sway = amplitude * Math.sin((travelled / wave) * Math.PI * 2 + phase);
    for (let tries = 0; tries < 3 && sway !== 0; tries++) {
      const px = x - dirZ * sway;
      const pz = z + dirX * sway;
      if (field(px, pz) - SINK >= y) break;
      sway *= 0.5;
      if (tries === 2) sway = 0;
    }
    points.push({
      x: x - dirZ * sway,
      z: z + dirX * sway,
      y,
      halfWidth: widest,
    });
  };

  // ── The source: uphill from the first crossing, narrowing to a trickle.
  {
    const head = anchors[0];
    const run = rng.range(SOURCE_RUN.min, SOURCE_RUN.max);
    const climb: RiverPoint[] = [];
    const block = roadBlock();
    let x = head.x;
    let z = head.z;
    let y = head.waterY;
    for (let d = 0; d < run; d += STEP) {
      const grade = downhill(field, x, z);
      // Walk INTO the slope: upstream is uphill, by definition — bending
      // off the road the crossing below it stands on, and giving up on the
      // climb rather than running up the corridor.
      const away =
        d < CROSS_WINDOW ? null : awayFromRoad(roadClear, x, z, head.halfWidth + ROAD_KEEP);
      let dx = (grade ? -grade.x : Math.sin(phase)) + (away ? away.x * ROAD_PUSH : 0);
      let dz = (grade ? -grade.z : Math.cos(phase)) + (away ? away.z * ROAD_PUSH : 0);
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      x += dx * STEP;
      z += dz * STEP;
      if (d >= CROSS_WINDOW && block.hit(roadClear(x, z), head.halfWidth + ROAD_KEEP)) break;
      if (retraces(climb, x, z)) break;
      // Going upstream the surface only ever RISES, and never above the
      // ground it is cut into. Ground that fails to rise is not upstream of
      // anything: the spring is here, and the climb ends.
      const ceiling = field(x, z) - SINK;
      const next = Math.min(ceiling, y + STEP * 0.05);
      if (next <= y) break;
      y = next;
      climb.push({ x, z, y, halfWidth: head.halfWidth });
    }
    // The climb ended against a road: the steps it spent trying to get out
    // of the corridor are water inside it, and they go with it.
    trimToRoad(climb, 0, block.inside - 1);
    // A stream narrows the further up it you go, whatever the climb turned
    // out to be — a spring is a trickle even when the crossing below it is
    // a river. Widths are laid on after the walk, when its length is known.
    for (let i = 0; i < climb.length; i++) {
      const up = (i + 1) / (climb.length + 1);
      climb[i].halfWidth = Math.max(1.4, Math.min(cap, head.halfWidth) * (1 - up));
    }
    // EVERY course has a spring. The climb can come back empty — ground
    // that refuses to rise, a road it cannot get out from under on its
    // first step — and a watercourse whose first point is a road crossing
    // is a river that begins in the middle of itself: it has no source to
    // be narrower than, so it cannot be shown to gather, and it reads as
    // water that starts because the road wanted some. So when the walk
    // finds nothing, one is placed: a trickle a step upstream, at the head
    // of whatever slope is there.
    if (climb.length === 0) {
      const grade = downhill(field, head.x, head.z);
      const ux = grade ? -grade.x : Math.sin(phase);
      const uz = grade ? -grade.z : Math.cos(phase);
      climb.push({
        x: head.x + ux * STEP,
        z: head.z + uz * STEP,
        // Above the crossing by a real margin, never above the ground it
        // comes out of — and NEVER BELOW the crossing it feeds. Where the
        // country around a ford is lower than the water the road was built
        // for, there is no uphill to put a spring on, and forcing one there
        // inverts the course: the downhill pass that closes the trace then
        // drags every crossing down to the false source, and the water ends
        // up under its own bed. A seep at the crossing's own level is the
        // honest answer, and it keeps the course monotone.
        y: Math.max(
          head.waterY,
          Math.min(field(head.x + ux * STEP, head.z + uz * STEP) - SINK, head.waterY + SPRING_RISE),
        ),
        halfWidth: Math.max(1.4, Math.min(cap, head.halfWidth) * 0.5),
      });
    }
    // Walked from the crossing outward, so the source is the far end.
    climb.reverse();
    for (const p of climb) points.push(p);
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
    halfWidth: widest,
  });
  width = widest;
  for (let i = 1; i < anchors.length; i++) {
    const to = anchors[i];
    const from = anchors[i - 1];
    const total = Math.hypot(to.x - from.x, to.z - from.z);
    // The widest the water gets anywhere on this reach — what the road
    // clearance is measured against, so the rule does not tighten and
    // loosen as the channel gathers.
    const legWidth = Math.max(from.halfWidth, to.halfWidth) + total * GATHER;
    const leg: { x: number; z: number; y: number; w: number; dx: number; dz: number }[] = [];
    let x = from.x;
    let z = from.z;
    let level = from.waterY;
    let travelledLeg = 0;
    let refused = false;
    const block = roadBlock();
    let guard = 0;
    while (guard++ < 400) {
      const toX = to.x - x;
      const toZ = to.z - z;
      const left = Math.hypot(toX, toZ);
      if (left <= STEP) break;
      const aimX = toX / left;
      const aimZ = toZ / left;
      const grade = downhill(field, x, z);
      // Clear of the road between its two crossings — but not at them: the
      // reach leaves one corridor and arrives at the next, and inside those
      // windows the water is where it is supposed to be.
      const atCrossing = travelledLeg < CROSS_WINDOW || left < CROSS_WINDOW;
      const away = atCrossing ? null : awayFromRoad(roadClear, x, z, legWidth + ROAD_KEEP);
      // Water finds the valley — but it has an anchor to reach, so the
      // pull toward low ground only bends the course, never steers it.
      let dx = aimX + (grade ? grade.x * DOWNHILL_PULL : 0) + (away ? away.x * ROAD_PUSH : 0);
      let dz = aimZ + (grade ? grade.z * DOWNHILL_PULL : 0) + (away ? away.z * ROAD_PUSH : 0);
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      x += dx * STEP;
      z += dz * STEP;
      travelledLeg += STEP;
      // Pushed at, and still on the road: this reach would have to run
      // down the corridor to get there, so the two crossings are not on
      // the same water any more than a ridge between them would make them.
      if (!atCrossing && block.hit(roadClear(x, z), legWidth + ROAD_KEEP)) {
        refused = true;
        break;
      }
      // ...and a reach that has started circling is not going to arrive.
      if (retraces(leg, x, z)) {
        refused = true;
        break;
      }
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
      // ...and the pooling clause has a ceiling of its own. Holding the
      // level up at the downstream crossing's is what makes a chain of
      // tarns out of a hollow between two fords, and it is right — up to
      // the point where the hollow is deeper than a pool that size could
      // fill. Past `POOL_DEPTH` the level the road wanted is standing over
      // ground, which is a sheet of water laid across a valley rather than
      // water lying in one, so the two crossings are not the same water and
      // the course splits here.
      if (level - (ground - SINK) > POOL_DEPTH) {
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
    if (width > widest) widest = Math.min(cap, width);
    points.push({ x: to.x, z: to.z, y: to.waterY, halfWidth: widest });
    joined = i + 1;
  }

  // ── The mouth: downhill until the water finds WATER. A river ends in
  // something bigger than itself or it leaves the map; what it never does
  // is stop, and a walk that runs for a fixed distance and puts its last
  // point down wherever it got to is a river stopping in a field — which is
  // as visible from a kilometre up as a road that does the same.
  //
  // So the walk keeps going. It ends when the ground under it is standing
  // water (a lake, a sea basin), and only gives up at `MOUTH_RUN.max`,
  // which is not a bug but a closed basin: a landscape with nowhere lower
  // to go. That, and a mouth a road refuses to let past, both end the same
  // way — as a POOL. Water with nowhere to run does not evaporate, it
  // stands, so the last stretch is flattened to the level it reached and
  // widened into a tarn, and the river ends in water it made itself.
  let endsAt: River["endsAt"] = "pool";
  {
    const tail = anchors[joined - 1];
    const block = roadBlock();
    let x = tail.x;
    let z = tail.z;
    let y = tail.waterY;
    // Below every crossing it has taken, the river is at least as big as
    // the biggest of them: water that has gathered does not un-gather.
    width = Math.max(width, ...anchors.slice(0, joined).map((a) => a.halfWidth));
    const from = points.length;
    // R35 — where the water it is running to actually is. The pour laid
    // the lakes down before any of this, so a mouth is not a search: it is
    // a journey to somewhere that already exists.
    let target = standingAt.nearestAt(x, z, MOUTH_REACH);
    let sinceLook = 0;
    /** Where the walk itself has been — the points carry the meander's
     * sway on top of it, and it is the WALK that circles. */
    const trail: { x: number; z: number }[] = [];
    for (let d = 0; d < MOUTH_RUN.max; d += STEP) {
      const grade = downhill(field, x, z);
      if (sinceLook++ >= SEAWARD_REFRESH) {
        target = standingAt.nearestAt(x, z, MOUTH_REACH);
        sinceLook = 0;
      }
      // ...and only water it can run DOWN to. A tarn on the shoulder above
      // is not where this river is going.
      const reachable = target !== null && target.level <= y;
      // R35 — and if there is nothing to reach, STOP. Before the water was
      // on the map a mouth had no way of telling "not there yet" from
      // "nowhere to go", so it walked its whole run and pooled wherever it
      // had got to — a kilometre and a half of drawn river, wandering past
      // every road on the way, to arrive at the same tarn it could have
      // made in fifty metres. Now the pour knows, so the course can.
      if (!reachable) break;
      let seaX = 0;
      let seaZ = 0;
      if (target && target.level <= y) {
        const tx = target.x - x;
        const tz = target.z - z;
        const far = Math.hypot(tx, tz) || 1;
        seaX = (tx / far) * SEAWARD_PULL;
        seaZ = (tz / far) * SEAWARD_PULL;
      }
      // Downhill, bending off any road it runs at — and pooling at one it
      // cannot get around, because the water below the last crossing has
      // nowhere it has to be.
      const away = d < CROSS_WINDOW ? null : awayFromRoad(roadClear, x, z, width + ROAD_KEEP);
      let dx = (grade ? grade.x : -Math.sin(phase)) + seaX + (away ? away.x * ROAD_PUSH : 0);
      let dz = (grade ? grade.z : -Math.cos(phase)) + seaZ + (away ? away.z * ROAD_PUSH : 0);
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      x += dx * STEP;
      z += dz * STEP;
      if (d >= CROSS_WINDOW && block.hit(roadClear(x, z), width + ROAD_KEEP)) break;
      if (retraces(trail, x, z)) break;
      trail.push({ x, z });
      travelled += STEP;
      width += STEP * GATHER;
      const ground = field(x, z);
      y = Math.min(y, ground - SINK);
      push(x, z, y, dx, dz);
      // It reached standing water: the lake IS the end of the river.
      // R35 — ANY standing water, at whatever level the pour left it. A
      // course that only recognises the sea walks straight through the
      // tarn it should have emptied into and goes looking for the coast.
      const lake = standingAt.levelAt(x, z);
      if (lake !== null && ground < lake + 1) {
        endsAt = "water";
        break;
      }
      // ...or it has left the country the stage occupies, which is the
      // other honest way to end: where it goes after that is nobody's
      // business, exactly as it is for a road that runs off the map (R17).
      if (d > MOUTH_RUN.min && bounds && offMap(bounds, x, z)) {
        endsAt = "map";
        break;
      }
    }
    // Same for the mouth — and the trim comes FIRST, so a pool forms in the
    // last place the water was actually allowed to be rather than in the
    // corridor the walk died in.
    trimToRoad(points, from, block.inside - 1);
    if (endsAt === "pool") poolAt(points, from, widest, cap);
  }

  const used = anchors.slice(0, joined);

  // The two ENDS are sunk into the ground: a spring comes out of a
  // hillside and a mouth runs into what it joins, so neither is drawn lying
  // flat on the surface. Applied HERE, with the whole course built, because
  // the sink is bounded by the fall each end actually has — sink a spring
  // past the crossing below it and the downhill pass that follows drags the
  // entire course down to match, which puts the water at every crossing
  // under its own bed.
  if (points.length > 1) {
    const last = points.length - 1;
    points[0].y -= sinkEnd(points[0].y, points[1].y);
    points[last].y -= sinkEnd(points[last].y, points[last - 1].y);
  }

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
    endsAt,
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
  standingAt: StandingWater,
  roadClear: RoadClear = OPEN_COUNTRY,
  bounds?: WorldBounds,
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
    const river = traceCourse(seed, course, field, standingAt, roadClear, bounds);
    rivers.push(river);
    if (river.rest.length > 0) pending.push(river.rest);
  }
  return rivers;
}
