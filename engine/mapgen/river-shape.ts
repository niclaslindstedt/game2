// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A WATERCOURSE IS, and the numbers every part of tracing one shares:
// the anchors the road hands in, the points a course is laid as, the river
// it adds up to, and the vocabulary the trace draws from — how long a step
// is, how far a source runs above the first crossing, how wide the water
// may get, how far it stays off the road. The leaf of `river.ts`: the
// helpers in `river-field.ts` and the trace itself both read it, and it
// reads nothing.

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
  /** How far across the road its mat and shoulder reach from the anchor,
   * m — where the water leaving the crossing is first its own again. */
  edge: number;
  /** True when the road carries it in a pipe under its own fill (R12):
   * neither waded nor spanned, and no water on the road at all. */
  culvert?: boolean;
  /** Arc position of the crossing on the stage — how a streaming run
   * prunes the water it has driven past. */
  s: number;
  /** The road's heading where it crosses, rad — the water leaves the
   * crossing ACROSS the road, and this is what across means. */
  heading: number;
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
export const STEP = 14;
/** Two crossings further apart than this are not the same river. */
export const SAME_RIVER = 900;
/** How far the source runs above the first crossing, meters. */
export const SOURCE_RUN = { min: 260, max: 460 };
/** ...and how far the mouth runs below the last crossing looking for water
 * to end in. A river ENDS SOMEWHERE — in a lake, in a sea basin, or off the
 * edge of the world — so the walk is not a fixed run that stops wherever it
 * has got to: it keeps going until it finds one of those. `min` is only how
 * far it goes before it is allowed to consider having left the map, and
 * `max` is the guard against a walk that never terminates, which is a
 * landscape with a closed basin in it rather than a bug. A course that hits
 * the guard is drawn ending in a POOL — flat water in the lowest ground it
 * reached — because that is what water with nowhere to go actually does. */
export const MOUTH_RUN = { min: 380, max: 1800 };
/** How far outside the stage's own country a mouth has to get before
 * running off the map counts as having ended somewhere, m. Past the fog
 * ceiling, like a branch's escape (`SPUR.escape`), so it is never seen
 * ending. */
export const OFF_MAP = 140;
/** A POOL: how many points of the mouth's tail are flattened into standing
 * water, and how much wider than the river it spreads. A river's worth of
 * water sitting in a hollow is a tarn, not a puddle. */
export const POOL_POINTS = 6;
export const POOL_SPREAD = 2.6;
/** ...and how far above the pool's own level a point of the tail may have
 * been walked at and still be part of the pool, m. The walk only ever
 * descends, so the level is the LAST point's and every point upstream of it
 * stands higher; flattening a fixed number of them to the level cuts the
 * ground under each by however much higher it stood. Where the walk was
 * still running downhill when it was stopped that is a trench, not a tarn
 * — seed 12's mouth dropped nine metres in its last six points and the
 * pool carved a canyon along the road beside it. A pool fills a HOLLOW: it
 * reaches back only over ground that is already nearly at its level. */
export const POOL_FILL = 0.6;
/** How far under the land a reach may run before joining two crossings
 * would mean cutting a gorge rather than following a valley, m. Past it
 * the two are on different water — which is what a watershed IS. */
export const RIDGE = 9;
/** ...and how far a reach's surface may stand ABOVE the ground on the way,
 * m. Standing water between two crossings is a pool and belongs there; a
 * pool deeper than this is a hollow the road's own water level could never
 * have filled, so what would be drawn is a sheet of water lying across a
 * valley. Two crossings either side of one are on different water. */
export const POOL_DEPTH = 2.5;
/** How much the channel widens per meter travelled — a river collects. */
export const GATHER = 0.004;
/** ...and the widest half-width a WATERCOURSE ever reaches, m. Past this it
 * is not a river any more, it is a lake, and a lake is the landscape's job
 * (the basins in `geology.ts`) rather than a channel's. Without the cap a
 * long mouth gathers itself into a hundred-metre sheet of water that then
 * fails every clearance rule it meets, because a strip that wide cannot
 * keep away from anything. */
export const MAX_WIDTH = 20;
/** Meander: how far the course sways off the direct line, and how long one
 * sway is, meters. */
export const MEANDER = { amplitude: { min: 10, max: 26 }, wave: { min: 90, max: 200 } };
/** How hard the course is pulled toward lower ground against its heading
 * toward the next anchor, 0..1 — water finds the valley, but it still has
 * somewhere to be. */
export const DOWNHILL_PULL = 0.4;
/** Clearance the water surface keeps under the surrounding ground, m —
 * the water is IN the landscape, never running along the top of it. */
export const SINK = 0.4;
/** Bank blend distance from the water's edge back to the landscape, m —
 * how far out from the water the channel is cut into the ground. */
export const BANK = 9;
/** Room a watercourse keeps between its own edge and a road's, m: the
 * bank it cuts, and then some. Inside this the carve would be eating the
 * ground the ribbon stands on. The "some" is also the room the push has
 * to bend the course back out in: `water.road` measures the course
 * against half of R23's clearance, and a walk that only turns once it is
 * at that line leaves the points it turned on inside it. */
export const ROAD_KEEP = BANK + 7;
/** ...and how much of a reach either end of it the rule lets go of, m. The
 * last stretch into a ford — or under a deck — is water running at a road
 * ON PURPOSE, and it has to be able to reach it. */
export const CROSS_WINDOW = 40;
/** How far out of a crossing the water holds the crossing's own level, m,
 * before it is allowed to fall with the ground: the reach the crossing
 * read its valley over (`water.bankReach`), and a step, so the pool stands
 * on ground the crossing knew about. */
export const POOL_REACH = 28;
/** How far under the pool's level the ground beside a crossing may stand
 * and still be under the pool rather than a place the water leaves it, m:
 * the crossing read its valley at a handful of points, and the ground
 * between them is not read at all. */
export const POOL_SLACK = 0.6;
/** The steepest a source climbs, m per m — a mountain stream's cascade.
 * The surface is held under the ground whatever the climb, so this only
 * ever binds on a slope steeper than a cascade; capped at a brook's five
 * per cent it fell further and further under a hillside and the channel
 * it cut was a canyon thirteen metres deep. */
export const SOURCE_CLIMB = 0.35;
/** How hard a road pushes the course off it, against the anchor it is
 * steering for. Firmer than the valley's pull: a river bends toward low
 * ground, but it does not run down a road. */
export const ROAD_PUSH = 2.2;
/** How many steps a walk may spend inside a road's keep-out before the
 * road is what ends it. A step or two is the push working — the course
 * bending back out of the corridor — and longer than this is water that
 * would have to run down the road to get where it is going. */
export const PUSH_GRACE = 2;
/** How far ahead of the keep-out a walk starts turning off a road, m: a
 * step, so it turns BEFORE it is inside rather than once it is. The points
 * a walk lays while the push is still winning stay on the course, and the
 * analyzer measures them against the road like any other. */
export const PUSH_AHEAD = STEP;

/** How far a course's two ENDS are sunk under the level the walk gave them,
 * m: a spring comes out of a hillside and a mouth runs into what it joins,
 * so neither is drawn lying flat on the surface. */
export const END_SINK = 2.2;
/** How far above the crossing it feeds a MADE spring is placed, m — the one
 * put there when the uphill walk found nothing to climb. Enough to be a
 * source rather than a second name for the crossing. */
export const SPRING_RISE = 2.5;

/** ...and how much of that an end may actually take, given the level of the
 * point next to it. An end sunk PAST its neighbour inverts the course there,
 * and the downhill pass that closes the trace then drags everything below it
 * down to match — which puts the water at every crossing under its own bed.
 * So an end never takes more than half the fall it has. */

/** The country the stage occupies — a mouth that gets outside it by
 * `OFF_MAP` has left, which is one of the two honest ways for a river to
 * end. Optional: without one, the only ending is water. */
export type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type Field = (x: number, z: number) => number;
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
export const MOUTH_REACH = 1400;
/** How hard it is pulled that way, against the local downhill (a unit
 * vector) and the road's push. Water runs downhill AND it runs to the sea;
 * this is the second of those, and it is deliberately weaker than the
 * road's shove so a course still bends out of a corridor rather than
 * ploughing down it toward the lake. */
export const SEAWARD_PULL = 0.9;
/** How often the mouth re-asks where the water is, in steps. A fixed
 * destination for a stretch at a time keeps the course purposeful instead
 * of twitching at every cell boundary the answer crosses. */
export const SEAWARD_REFRESH = 8;

/** No road anywhere: what a caller with no road to report hands in. */
export const OPEN_COUNTRY: RoadClear = () => Infinity;
