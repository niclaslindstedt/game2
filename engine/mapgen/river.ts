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
// And it is born in a GULLY, never on a spur: the walk up to the spring
// climbs the valley line (`upGully` — the lowest point of the contour a
// step ahead), because steepest ascent converges on a ridge and water is
// in the ground, not along the top of it; where the contour falls away on
// both sides the water has run out of gully, and the spring is there
// (`onCrest`).
//
// The road's crossings are its ANCHORS: the generator decided where the
// stage fords or bridges water (R7/R13), and the river is routed through
// exactly those points at exactly the water level the road was built for.
//
// And it meets the road THERE AND NOWHERE ELSE. Two crossings are joined
// by a reach that keeps clear of the corridor between them: a pipe under
// the road is a crossing the road planned (R12's culvert, an anchor like
// any other), and water routed under a road anywhere else digs the ground
// out from under the ribbon and leaves the road standing on a bank of
// nothing, with a sheet of water drawn through it.

import { createRng } from "../lib/prng.ts";
import {
  acrossRoad,
  awayFromRoad,
  clamp,
  downhill,
  groupAnchors,
  leaving,
  offMap,
  onCrest,
  poolAt,
  retraces,
  roadBlock,
  sinkEnd,
  stepAcross,
  trimToRoad,
  upGully,
} from "./river-field.ts";
import {
  CROSS_WINDOW,
  DOWNHILL_PULL,
  GATHER,
  MAX_WIDTH,
  MEANDER,
  MOUTH_REACH,
  MOUTH_RUN,
  OPEN_COUNTRY,
  POOL_DEPTH,
  POOL_REACH,
  POOL_SLACK,
  PUSH_AHEAD,
  RIDGE,
  ROAD_KEEP,
  ROAD_PUSH,
  SEAWARD_PULL,
  SEAWARD_REFRESH,
  SINK,
  SOURCE_CLIMB,
  SOURCE_RUN,
  SPRING_RISE,
  STEP,
  type Field,
  type River,
  type RiverAnchor,
  type RiverPoint,
  type RoadClear,
  type StandingWater,
  type WorldBounds,
} from "./river-shape.ts";

export * from "./river-shape.ts";

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
  const push = (
    x: number,
    z: number,
    y: number,
    dirX: number,
    dirZ: number,
    /** True inside a crossing's window, where the course is where the
     * crossing put it: swayed there, the first point out of a ford landed
     * fifteen metres down the road and the sheet between it and the
     * anchor missed the mat it was meant to cover. */
    steady = false,
  ): void => {
    if (width > widest) widest = Math.min(cap, width);
    let sway = steady ? 0 : amplitude * Math.sin((travelled / wave) * Math.PI * 2 + phase);
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
    const across = acrossRoad(field, head, false);
    let x = head.x;
    let z = head.z;
    let y = head.waterY;
    let dirX = across.x;
    let dirZ = across.z;
    // The first step is to the road's EDGE, straight across: the point the
    // water is first its own again, at the pool's level, so the sheet
    // between it and the anchor lies flat over the mat. A full step out
    // put that point past the apron and the sheet's tilt onto it.
    for (let d = 0, stride = head.edge; d < run; d += stride, stride = STEP) {
      const grade = downhill(field, x, z);
      // Walk INTO the slope: upstream is uphill, by definition — leaving
      // the crossing across the road, bending off the road the crossing
      // below it stands on, and giving up on the climb rather than running
      // up the corridor.
      const away =
        d < CROSS_WINDOW
          ? null
          : awayFromRoad(roadClear, x, z, head.halfWidth + ROAD_KEEP + PUSH_AHEAD);
      // Up the gully the water came down, not the spur beside it.
      const up = upGully(
        field,
        x,
        z,
        dirX + (grade ? -grade.x : Math.sin(phase)),
        dirZ + (grade ? -grade.z : Math.cos(phase)),
        grade,
        stride,
      );
      const { x: dx, z: dz } = stepAcross(
        up.x + (away ? away.x * ROAD_PUSH : 0),
        up.z + (away ? away.z * ROAD_PUSH : 0),
        across,
        leaving(d),
      );
      x += dx * stride;
      z += dz * stride;
      dirX = dx;
      dirZ = dz;
      if (d >= CROSS_WINDOW && block.hit(roadClear(x, z), head.halfWidth + ROAD_KEEP)) break;
      if (retraces(climb, x, z)) break;
      {
        const there = downhill(field, x, z);
        if (d > 0 && there && onCrest(field, x, z, there)) break;
      }
      // Going upstream the surface only ever RISES, and never above the
      // ground it is cut into. Ground that fails to rise is not upstream of
      // anything: the spring is here, and the climb ends. Inside the
      // crossing window it does not rise at all: the water just above a
      // ford stands at the ford's level, and a surface climbing away from
      // the crossing at the walk's grade drew its sheet half a metre over
      // the mat's edge on the apron beside every ford.
      const ceiling = field(x, z) - SINK;
      // The first point out is still the pool: laid at the crossing's own
      // level, so the sheet between it and the anchor lies flat over the
      // mat rather than tilting up onto the apron. From there the water
      // climbs in its own gully, as far as the ground climbs.
      const rise = d === 0 ? 0 : stride * SOURCE_CLIMB;
      const next = rise === 0 && ceiling >= y - POOL_SLACK ? y : Math.min(ceiling, y + rise);
      if (next < y || (rise > 0 && next === y)) break;
      y = next;
      climb.push({ x, z, y, halfWidth: head.halfWidth });
    }
    // The climb ended against a road: the steps it spent trying to get out
    // of the corridor are water inside it, and they go with it.
    trimToRoad(climb, 0, block.inside);
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
      // Across the road, like every course leaving a crossing: uphill from
      // a crossing on an embankment is along the road.
      climb.push({
        x: head.x + across.x * STEP,
        z: head.z + across.z * STEP,
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
          Math.min(
            field(head.x + across.x * STEP, head.z + across.z * STEP) - SINK,
            head.waterY + SPRING_RISE,
          ),
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
    const leg: {
      x: number;
      z: number;
      y: number;
      w: number;
      dx: number;
      dz: number;
      steady: boolean;
    }[] = [];
    let x = from.x;
    let z = from.z;
    let level = from.waterY;
    let travelledLeg = 0;
    let refused = false;
    const block = roadBlock();
    // The reach leaves its crossing across the road, on the side the next
    // crossing is on.
    const nx = Math.cos(from.heading);
    const nz = -Math.sin(from.heading);
    const side = (to.x - from.x) * nx + (to.z - from.z) * nz < 0 ? -1 : 1;
    const across = { x: nx * side, z: nz * side };
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
      const away = atCrossing
        ? null
        : awayFromRoad(roadClear, x, z, legWidth + ROAD_KEEP + PUSH_AHEAD);
      // Water finds the valley — but it has an anchor to reach, so the
      // pull toward low ground only bends the course, never steers it.
      const { x: dx, z: dz } = stepAcross(
        aimX + (grade ? grade.x * DOWNHILL_PULL : 0) + (away ? away.x * ROAD_PUSH : 0),
        aimZ + (grade ? grade.z * DOWNHILL_PULL : 0) + (away ? away.z * ROAD_PUSH : 0),
        across,
        leaving(travelledLeg),
      );
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
      // ...and it leaves a crossing at the crossing's own level, holding it
      // as far as the crossing read its ground (the same pool the mouth
      // holds — see there).
      if (travelledLeg >= POOL_REACH) level = Math.min(level, ground - SINK);
      level = Math.max(to.waterY, level);
      // ...and it ARRIVES at the crossing's level, not above it. A reach
      // held up by the ground on the way can reach the last step before a
      // ford still metres over it — a gully's side is steeper than a step
      // is long — and the sheet of the point above the drop then stands
      // over the road's edge beside the ford. Down to the crossing's level
      // over the window, on a curve that lands the last point ON it.
      if (left < CROSS_WINDOW) {
        const t = Math.max(0, left - STEP) / (CROSS_WINDOW - STEP);
        level = Math.min(level, to.waterY + (level - to.waterY) * t * t);
      }
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
        steady: atCrossing,
      });
    }
    if (refused) break;
    travelled += travelledLeg;
    for (const p of leg) {
      width = p.w;
      push(p.x, p.z, p.y, p.dx, p.dz, p.steady);
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
    const across = acrossRoad(field, tail, true);
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
      // made in fifty metres. Now the pour knows, so the course can — once
      // it is clear of the crossing: the water is seen to LEAVE the road
      // and pool beyond it, rather than stopping dead at the far edge of
      // the mat.
      if (!reachable && d >= POOL_REACH) break;
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
      const away =
        d < CROSS_WINDOW ? null : awayFromRoad(roadClear, x, z, width + ROAD_KEEP + PUSH_AHEAD);
      const { x: dx, z: dz } = stepAcross(
        (grade ? grade.x : -Math.sin(phase)) + seaX + (away ? away.x * ROAD_PUSH : 0),
        (grade ? grade.z : -Math.cos(phase)) + seaZ + (away ? away.z * ROAD_PUSH : 0),
        across,
        leaving(d),
      );
      x += dx * STEP;
      z += dz * STEP;
      if (d >= CROSS_WINDOW && block.hit(roadClear(x, z), width + ROAD_KEEP)) break;
      if (retraces(trail, x, z)) break;
      trail.push({ x, z });
      travelled += STEP;
      width += STEP * GATHER;
      const ground = field(x, z);
      // The crossing's water is ONE level, on the road and beside it: the
      // ford is a pool the road wades, laid at the lowest ground the
      // crossing has (`valleyUnder`), and the river holds that level as
      // far out as that ground was read before it starts to fall. Let fall
      // from the first step and the sheet on the road stood a metre over
      // the river running off it — a step in a water surface; held for
      // the whole crossing window it stood over ground the crossing never
      // read.
      if (d >= POOL_REACH) y = Math.min(y, ground - SINK);
      push(x, z, y, dx, dz, d < CROSS_WINDOW);
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
    trimToRoad(points, from, block.inside);
    if (endsAt === "pool") poolAt(points, from, widest, cap, roadClear);
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
