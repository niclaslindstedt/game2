// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE TARMAC, laid before anybody thought about a rally.
//
// A sealed road is not a property of the racing line. It is a public road
// that was there first, that goes somewhere, and that the stage borrows for
// a kilometre before turning off it again. Deriving it from the route
// instead — sealing whichever stretch a paving field happened to point at,
// and inventing a stub for the arm the route does not take — is what makes
// a crossing read as two ribbons colliding: the "other road" starts at the
// junction, wanders, and stops in a field, because it was never a road.
//
// So this module runs FIRST, on nothing but the seed, the dials and the
// bare country. It lays whole roads across the map, edge to edge, steering
// round the lakes — and because they are built from edge to edge, a tarmac
// road leading somewhere is a property of the construction rather than
// something a later check has to hope for.
//
// What it does NOT decide is height. The stage's elevation is a profile
// along the ROUTE's arc, not a heightfield, so a road's height is only
// settled once it is known which piece of it the route drives; a highway
// laid on the bare land would disagree with the route the moment the two
// shared ground. This module answers WHERE the tarmac goes. `compile.ts`
// settles how high it is, from the junction outward, the way it always has.

import { createRng } from "../lib/prng.ts";
import { cellKey } from "../lib/math.ts";
import { biomeRules } from "./biomes.ts";
import { LAKE_Y, type LandField } from "./land.ts";
import { roadClearance } from "./road.ts";
import { STAGE_RULES as R, type StageKnobs } from "./rules.ts";

/** One point on a tarmac road's centerline. No height: see the header. */
export type HighwayPoint = {
  x: number;
  z: number;
  /** Direction of travel along the road at this point, radians. */
  heading: number;
  /** Distance from the road's first point, m. */
  s: number;
};

/** What a laid line IS. A public road the rally may borrow, meet at a
 * junction or cross (R17, R36); or — R41 — a RAILWAY, which it may only
 * cross, on a ramp, and which a train runs down. Both are laid here, before
 * the route, and both hold the route off by the same clearance: the search
 * plans round a line without asking what it is. */
export type HighwayKind = "road" | "rail";

export type Highway = {
  points: HighwayPoint[];
  /** Full carriageway width, m — the stage's own, because a rally borrows
   * the road it meets rather than one built to a different gauge. For a
   * railway, the formation's width: ballast shoulder to ballast shoulder. */
  width: number;
  kind: HighwayKind;
};

/** How a line is laid: the numbers `layOne` walks by. The tarmac's are
 * `HIGHWAY`; a railway's are `RAILWAY`, and the difference between the two
 * is the difference between a road and a railway — one bends, the other
 * very nearly does not. */
export type LineRules = {
  step: number;
  overrun: number;
  minRadius: number;
  bend: number;
  shoreLook: number;
  shoreFreeboard: number;
  avoidRadius: number;
  wander: { min: number; max: number };
  correction: number;
  tries: number;
};

/** How the tarmac is laid, in meters unless noted. */
export const HIGHWAY: LineRules = {
  /** Spacing along a road's centerline, m. Coarser than the stage's own
   * sampling: nothing drives this line until the compiler has resampled the
   * piece the route uses, and everything else asks it for distances
   * measured in tens of meters. */
  step: 8,
  /** How far outside the stage's world bound a road starts and ends, m. It
   * has to leave the map by more than the fog can reach, so it is never
   * seen ending — and by more than a branch's own escape, since the piece
   * the player can drive is cut from this line. */
  overrun: 320,
  /** Radius the line never turns tighter than, m. A public road through
   * open country bends; it does not corner. */
  minRadius: 220,
  /** ...and how often it redraws that bend, m. Short enough that a
   * kilometre of road is several bends and not one, which is what R38 asks
   * of any stretch of it the rally borrows. */
  bend: 120,
  /** How far ahead it looks for water, and how far above the water table
   * the ground has to stand before it will drive on it. A road does not
   * strike out across a lake on an embankment. */
  shoreLook: 190,
  shoreFreeboard: 2,
  /** ...and the radius it is allowed to bend to while it skirts one, m. */
  avoidRadius: 70,
  /** How hard the road's own bend is when it draws one, as a share of
   * `minRadius`'s curvature. A BAND with its floor off zero, because the
   * thing being drawn is a bend: allowed to come out near zero it mostly
   * did, and what that produces is not a gently wandering road but a ruled
   * line with an occasional kink in it. The floor puts the loosest bend at
   * a 550 m radius and the tightest at the road's own minimum — which is
   * the country lane this is meant to be, and, since both are inside R38's
   * `straightRun.bend`, a road with corners on it for a rally to borrow. */
  wander: { min: 0.4, max: 1 },
  /** How hard it may steer back onto its bearing once it has gone round
   * something — or once its own wandering has taken it off the line — as a
   * share of `minRadius`'s curvature. It is the FULL share on purpose: the
   * correction is added to the wander rather than blended with it, so only
   * at parity can it always straighten the road out again, and a road that
   * cannot straighten out never reaches the far rim. */
  correction: 1,
  /** How many entry points a road may try before the country is judged not
   * to carry one there. */
  tries: 40,
};

/** R41 — how a RAILWAY is laid. The same walk, with a railway's numbers: a
 * single track through forest country holds a curve a rally road would
 * call a straight, so it bends at radii of half a kilometre and up, redraws
 * its bend rarely, and where a lake is in the way it goes round on a sweep
 * rather than a dodge — and where it cannot, there is no railway on this
 * seed, which is what most seeds have. Fewer tries than a road: a line that
 * will not fit at forty entry points will not fit at the forty-first. */
export const RAILWAY: LineRules = {
  step: 8,
  overrun: 320,
  minRadius: 480,
  bend: 260,
  // It sees the water further off than a road does and goes round it on
  // a curve a branch line would actually have — held to a main line's
  // radius it was refused by the water on five attempts in six, and a
  // country whose lakes refuse every railway is a country with none.
  shoreLook: 300,
  shoreFreeboard: 2,
  avoidRadius: 95,
  wander: { min: 0.3, max: 1 },
  correction: 1,
  tries: 30,
};

/** Cell edge of the lookup grid, m — a couple of points per cell. */
const INDEX_CELL = 32;

/** How far the network's DILATED cell set reaches, m: the widest distance a
 * `nearest` query may ask about and still be answered by one set lookup
 * when there is no road near. Comfortably over R23's clearance at the
 * widest road the dial builds, which is what the search asks of every probe
 * point. */
const NEAR = 128;

/** ...and the same trick again at the range the BORROW and the CROSSING ask
 * about (`paving.borrow.seek`, `crossing.seek`), on a cell coarse enough
 * that dilating to it stays cheap.
 *
 * The two looks are asked once a segment rather than once a metre, so the
 * ring walk they used to pay was easy to write off — but the walk they pay
 * is the WHOLE of it. A query that finds nothing has no first hit to bound
 * itself with, so at 600 m it sweeps twenty rings of a 32 m grid, some
 * fourteen hundred cell lookups, to answer "no road here"; and "no road
 * here" is the answer nearly every time, because the look runs at every
 * segment of every candidate and a stage meets a public road once or twice.
 * Answering it out of a set costs one lookup instead, and took the plan
 * phase of seeds 1-8 at medium from 3.1 s to 2.2 s — the worst of them,
 * seed 2, from 900 ms to 550.
 *
 * `FAR` has to cover the widest bounded query anything asks, and the
 * dilation has to cover `FAR` from anywhere inside a cell — hence the ring
 * either side, exactly as `NEAR`'s does. Ask for more than this and the
 * fast path is skipped rather than answered wrongly. */
const FAR = 640;
const FAR_CELL = 128;

/** R24 — how far up +z from the origin the stage's opening straight is
 * known to run, m, whatever the seed draws: the launch run the grid needs,
 * the vocabulary's own opening, and the jitter the search adds on top. The
 * tarmac is laid clear of it. */
const START_RUN = Math.max(R.openingStraight, R.launch.run) + 40;

export type HighwayHit = {
  road: Highway;
  /** Index of the nearest point on it. */
  index: number;
  /** Distance to that point, m. */
  d: number;
};

export type HighwayNetwork = {
  roads: Highway[];
  /** The nearest piece of tarmac to a point, or null when the map has none
   * — or none inside `within`. Spatially hashed: the route's search asks
   * this of every probe point of every candidate it draws.
   *
   * `within` is not a nicety, it is the whole cost model. Most of a map is
   * nowhere near a road, and without a limit the ring walk has no first hit
   * to bound itself with and sweeps every cell it has: measured on the
   * sprint search, unbounded queries took a medium stage from half a second
   * to build to two and a half. Ask for the distance you actually care
   * about — R23's clearance, the borrow's reach — and the walk stops at the
   * first ring that cannot beat it.
   *
   * `except` skips one road, which is what a route BORROWING a road needs:
   * while it is joining that one it is allowed inside its clearance, and it
   * still is not allowed inside anybody else's.
   *
   * `only` narrows the answer to one KIND of line — a borrow wants the
   * nearest ROAD, a rail crossing the nearest RAILWAY — where a clearance
   * query wants the nearest anything and leaves it unset. */
  nearest: (
    x: number,
    z: number,
    except?: Highway,
    within?: number,
    only?: HighwayKind,
  ) => HighwayHit | null;
};

/** How many sealed roads a stage's country carries.
 *
 * The `asphalt` dial is the share of the ROUTE that comes out paved (R15),
 * and the only way the route can buy a metre of it is to be driving on one
 * of these — so the dial has to move the COUNTRY, not just the surface. A
 * rally that meets a public road twice in a stage is in country with
 * several of them; one that never meets one is out in the back of beyond.
 * Measured over seeds 1-24 at medium with a fixed single road, the dial did
 * nothing at all past its floor: 11% of the road came out sealed at 0.15
 * and 13% at 0.80, because one road across a map can only be met so often.
 *
 * But the count is NOT where the dial spends, and it was measured twice
 * before that was believed. The route may not CROSS a public road (R17), so
 * every road laid partitions the country the search has left — and a medium
 * stage is four kilometres of road inside a three-kilometre map. Two roads
 * across one and seed 15 could not be generated at any sub-seed or any dial
 * position; the sealed share it bought on the seeds that did generate went
 * DOWN, from 8.9% to 5.8%, because the search spends its retries getting
 * round the roads instead of onto them.
 *
 * So the count grows with the COUNTRY alone: one road crosses a sprint's
 * map, a long stage's has room for two. The land still has the final say —
 * `layHighways` refuses a road it will not carry, and R23 keeps two of them
 * apart — so a seed can come out with fewer, or with none, and roughly half
 * of them do.
 *
 * What that leaves is a dial with a CEILING the country sets, and it is
 * worth stating plainly because it is a real change: measured over eight
 * long stages, `asphalt` buys nothing at 0, about 6% of the road at 0.1 and
 * about 10% at 0.25, and past that the map runs out — there is only so far
 * a rally can drive down one public road inside a bounded world before R9
 * puts it outside. The dial asks; the country answers. */
export function highwayCount(knobs: StageKnobs, worldBound: number): number {
  if (knobs.asphalt < R.paving.floor) return 0;
  return worldBound >= 1800 ? 2 : 1;
}

/** Lay the tarmac for a seed. Deterministic in the seed, the dials and the
 * country — and in nothing else, so every consumer that rebuilds the
 * network gets the same roads. */
export function layHighways(
  seed: number,
  knobs: StageKnobs,
  land: LandField,
  /** Half-extent of the world the stage is built in, m
   * (`stageLengths[*].worldBound`). */
  worldBound: number,
  width: number,
): Highway[] {
  const roads: Highway[] = [];
  const count = highwayCount(knobs, worldBound);
  for (let i = 0; i < count; i++) {
    // Several entries tried per road, because where a road can be laid is
    // the country's decision: a rim point out in a sea basin, or a line
    // that runs into a lake it cannot get round, is not a road worth
    // building, and the answer is to try somewhere else rather than to
    // build it anyway.
    for (let attempt = 0; attempt < HIGHWAY.tries; attempt++) {
      const road = layOne(
        (seed ^ ((i + 1) * 0x9e3779b9) ^ (attempt * 0x85ebca6b)) >>> 0,
        land,
        worldBound,
        width,
        roads,
        HIGHWAY,
        "road",
      );
      if (road) {
        roads.push(road);
        break;
      }
    }
  }
  return roads;
}

/** R41 — lay the RAILWAY for a seed, in a country that carries one: at
 * most a single line, on `rail.chance` of the seeds, walked the way a road
 * is and held off every road already laid. Nothing to do with the
 * `asphalt` dial — a railway is not tarmac and the rally never drives it —
 * so a stage with no sealed road on it can still have a train go by.
 *
 * `width` is the ROUTE's, as it is for a road: the R24 start clearance is
 * measured in it, and the formation's own width is the railway's
 * (`rail.line.width`). Deterministic in the seed, the dials and the country,
 * for `layHighways`'s reason. */
export function layRailways(
  seed: number,
  knobs: StageKnobs,
  land: LandField,
  worldBound: number,
  width: number,
  /** The roads already laid, which the line keeps off. */
  standing: readonly Highway[],
): Highway[] {
  if (!biomeRules(knobs.biome).railway) return [];
  const rng = createRng((seed ^ 0x51a7e3b9) >>> 0);
  if (!rng.chance(R.rail.chance)) return [];
  const rails: Highway[] = [];
  // Two lines laid edge to edge across one map cross each other unless
  // they run the same way, and a railway is not allowed to cross the road
  // (`layOne`'s R23 keep): entered anywhere on the rim it was refused on
  // three seeds in four. So where there is a road, the railway sets out
  // from the same side of the country as the road did — the way a line
  // and a road share a valley — and the dice spread it either side of that.
  // The spread is wide enough that the two are never simply parallel.
  const road = standing[0];
  const aim = road
    ? { entry: Math.atan2(road.points[0].x, road.points[0].z), spread: 0.55 }
    : undefined;
  for (let attempt = 0; attempt < RAILWAY.tries; attempt++) {
    const line = layOne(
      (seed ^ 0x3c6ef372 ^ (attempt * 0x85ebca6b)) >>> 0,
      land,
      worldBound,
      width,
      [...standing, ...rails],
      RAILWAY,
      "rail",
      aim,
    );
    if (line) {
      rails.push(line);
      break;
    }
  }
  return rails;
}

/** One road, walked from an entry on the map's rim to wherever it leaves.
 * Returns null where the country would not carry one — a rim point in a
 * lake, or a walk that never got clear — rather than laying a road that
 * stops. */
function layOne(
  seed: number,
  land: LandField,
  worldBound: number,
  width: number,
  standing: readonly Highway[],
  HIGHWAY: LineRules,
  kind: HighwayKind,
  /** Where on the rim to enter, radians, and how far either side of it the
   * dice may put the entry. Unset, anywhere on the rim. */
  aim?: { entry: number; spread: number },
): Highway | null {
  const rng = createRng(seed);
  const reach = worldBound + HIGHWAY.overrun;
  // Enter on one side of the rim and aim across the map, so the road is a
  // road THROUGH the country rather than a line clipping a corner of it.
  // The aim wanders as it goes; what this fixes is only which way it set
  // out.
  const entry = aim ? aim.entry + rng.range(-aim.spread, aim.spread) : rng.range(0, Math.PI * 2);
  let x = Math.sin(entry) * reach;
  let z = Math.cos(entry) * reach;
  // A road goes somewhere, so it is steered at a PLACE — the point on the
  // far rim it is headed for — rather than along a bearing. The difference
  // shows the first time it has to go round a lake: a bearing takes it out
  // of the country and leaves it there, because the correction that brings
  // it back is aiming it the way it was already pointing. Offset off the
  // exact diameter so it does not run through the middle of every seed's
  // map, but not so far that it clips a corner instead of crossing.
  const exit = entry + Math.PI + rng.range(-0.42, 0.42);
  const target = { x: Math.sin(exit) * reach, z: Math.cos(exit) * reach };
  let heading = Math.atan2(target.x - x, target.z - z);
  /** The bend the road last drew for ITSELF, 1/m. It is HELD until the next
   * redraw and added to the correction below, never fed back into itself: a
   * bend that decays toward the aim is gone a few steps after it is drawn,
   * and what that lays is not a wandering road but a ruled line with an
   * occasional kink in it. Measured that way over seeds 1-6, the median
   * radius came out between 1.1 and 29 km and three of the six ran
   * arrow-straight for over two kilometres, which is not a country road and
   * is not a road R38 lets a rally borrow. */
  let wander = 0;
  let curvature = 0;
  const points: HighwayPoint[] = [];
  const limit = Math.ceil((4 * reach) / HIGHWAY.step);

  /** The lowest the bare country gets above the water table along a bearing
   * inside the look-ahead, m. Negative is a lake in the way. */
  const clearance = (bearing: number): number => {
    const sin = Math.sin(bearing);
    const cos = Math.cos(bearing);
    let worst = Infinity;
    for (const ahead of [HIGHWAY.step, HIGHWAY.shoreLook * 0.4, HIGHWAY.shoreLook]) {
      const h = land.heightAt(x + sin * ahead, z + cos * ahead) - LAKE_Y;
      if (h < worst) worst = h;
    }
    return worst;
  };

  let entered = false;
  for (let i = 0; i < limit; i++) {
    points.push({ x, z, heading, s: i * HIGHWAY.step });
    if (Math.hypot(x, z) <= worldBound) entered = true;
    // Out the far side: the road has crossed the country and left it. Only
    // once it has been IN it — the walk starts out on the rim, so a first
    // step that bends outward would otherwise finish the road before it
    // reached the map at all.
    if (entered && Math.hypot(x, z) > reach) break;
    // The shore. A public road goes ROUND a lake — and it bends harder
    // doing it than it ever does in open country, which is why the dodge
    // has a radius of its own: at the sweeping radius a road holds across a
    // field it cannot turn away from water it can already see, and the
    // whole line gets thrown away for a lake it should have skirted.
    if (clearance(heading) < HIGHWAY.shoreFreeboard) {
      let best = 0;
      let bestClear = clearance(heading);
      for (const swing of [0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2]) {
        const clear = clearance(heading + swing);
        if (clear <= bestClear) continue;
        bestClear = clear;
        best = swing;
        if (clear >= HIGHWAY.shoreFreeboard) break;
      }
      // Nothing back toward the aim while it is skirting water: the pull is
      // what would steer it straight back in.
      heading += Math.sign(best) * Math.min(Math.abs(best), HIGHWAY.step / HIGHWAY.avoidRadius);
      curvature = 0;
      wander = 0;
      x += Math.sin(heading) * HIGHWAY.step;
      z += Math.cos(heading) * HIGHWAY.step;
      continue;
    }
    if (i > 0 && i % Math.round(HIGHWAY.bend / HIGHWAY.step) === 0) {
      const W = HIGHWAY.wander;
      wander = (rng.chance(0.5) ? 1 : -1) * rng.range(W.min, W.max) * (1 / HIGHWAY.minRadius);
    }
    // ...and always back toward where it is GOING, so a road that went
    // round a headland resumes crossing the map instead of carrying on the
    // way the detour left it pointing.
    let err = Math.atan2(target.x - x, target.z - z) - heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err <= -Math.PI) err += 2 * Math.PI;
    const pull = (Math.max(-1, Math.min(1, err * 4)) * HIGHWAY.correction) / HIGHWAY.minRadius;
    const sharpest = 1 / HIGHWAY.minRadius;
    curvature = Math.max(-sharpest, Math.min(sharpest, wander + pull));
    heading += curvature * HIGHWAY.step;
    x += Math.sin(heading) * HIGHWAY.step;
    z += Math.cos(heading) * HIGHWAY.step;
  }

  // A road that never got out of the country is not a road: better no
  // tarmac on a seed than tarmac that stops in a field.
  const last = points[points.length - 1];
  if (!last || !entered || Math.hypot(last.x, last.z) <= worldBound) return null;
  // ...and it stays out of the water for as far as anyone can SEE it. The
  // overrun past the map's rim is not held to that: it is beyond the fog by
  // construction, and a rim that happens to sit in a sea basin would
  // otherwise veto every road on the seed rather than the piece of one
  // nobody can look at.
  //
  // A SETBACK, in metres of ground, and never a freeboard in metres of
  // height — the distinction `land.ts` states and the reason it states it.
  // Asked as `flooded(p, shoreFreeboard)` this was "is this point less than
  // two metres above the water", which on a shore that shelves at two per
  // cent reaches a hundred metres inland and on a lakeside plain reaches
  // kilometres. It threw away roads that were nowhere near the water:
  // measured over seeds 1-24 at medium it vetoed 24 to 40 of every road's
  // 40 entry attempts on the wet ones, and four seeds — 2, 4, 8 and 19 —
  // ended up with no public road anywhere in the country, which is a
  // country with no civilization in it and, since R15's dial can only spend
  // on a road that exists, a stage that is gravel however far the dial is
  // turned up.
  //
  // What the rule is actually about is a road IN the water, and a road on
  // the beach. Both are distances: the carriageway and its verge clear of
  // the waterline.
  const seen = worldBound + HIGHWAY.overrun * 0.35;
  // The setback is the ROUTE'S OWN (`water.routeClear`), because it is the
  // same question about the same kind of road: room for the corridor, its
  // verge, and a watercourse to reach the lake between the two. Sized
  // smaller it buys public roads on every seed and hands back a lakeside
  // road that is near water by construction — over seeds 1-24 at medium,
  // half of it put 27 `water.road` errors on 14 seeds and 49 `drive.grade`
  // errors on 17, the second from roads climbing the bank they were
  // skirting. One number for both roads, and neither goes down to the
  // waterline.
  for (const p of points) {
    if (Math.hypot(p.x, p.z) > seen) continue;
    if (land.flooded(p.x, p.z, 0) || land.nearWater(p.x, p.z, R.water.routeClear)) return null;
  }
  // R24 — and it keeps off the RALLY'S START. The stage's first two
  // hundred metres are not a search result: the grid stands on the apron
  // behind the origin and the opening straight runs from it up +z, always,
  // on every seed. A public road laid across that is a road the field is
  // stacked on — and since the route may not cross the tarmac (R17), it is
  // also a stage that cannot be generated at all: seeds 2, 3 and 12 at
  // medium put one within 25 m of the start line and the search then failed
  // every sub-seed it had. The tarmac is what moves, because it is the
  // thing with somewhere else to go.
  const startClear = roadClearance(width);
  for (const p of points) {
    const along = Math.min(START_RUN, Math.max(-R.startZone.apron, p.z));
    if (Math.hypot(p.x, p.z - along) < startClear) return null;
  }
  // R23 — and two public roads do not run into each other out in the
  // country either. A crossroads is a place somebody built; two lines that
  // happen to touch is not. Nor does a railway cross a road: a level
  // crossing on the public road is a place too, and not one that is built.
  const keep = 4 * width;
  for (const other of standing) {
    for (const p of other.points) {
      for (const q of points) {
        if (Math.hypot(p.x - q.x, p.z - q.z) < keep) return null;
      }
    }
  }
  // ...nor into ITSELF. The walk is a wander with a floor on its radius and
  // a pull toward the far rim, and a shore can turn it round: skirting a
  // lake the dodge steers it off the aim for as long as the water is in
  // front of it, and a road that went round a headland came back up the
  // far side of its own line three metres from it (seeds 18, 20 and 23 at
  // medium, and a railway on 7). The two arms cut from such a road at a
  // borrowed junction then ran along each other for six hundred metres at
  // two heights. The window is the road's own radius of arc: inside it
  // two points of one road are near each other because that is what a
  // road is, and past it they cannot be unless it has folded.
  const window = Math.ceil(HIGHWAY.minRadius / HIGHWAY.step);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    for (let j = i + window; j < points.length; j++) {
      const q = points[j];
      if (Math.hypot(p.x - q.x, p.z - q.z) < keep) return null;
    }
  }
  return { points, width: kind === "rail" ? R.rail.line.width : width, kind };
}

/** Index the network so the route's search can ask where the tarmac is
 * without walking every point of every road. */
export function createHighwayNetwork(roads: Highway[]): HighwayNetwork {
  const grid = new Map<number, { road: Highway; index: number }[]>();
  /** ...and the same cells DILATED by `NEAR`: a cell in here is one from
   * which tarmac might be within R23's clearance at all.
   *
   * The search asks `nearest` of every probe point of every candidate it
   * draws — over a million queries on a medium stage — and nearly all of
   * them are out in country with no road in reach, where the ring walk has
   * no first hit to bound itself with and sweeps its whole radius for an
   * answer of "nothing". This turns that case into one set lookup. */
  const inReach = new Set<number>();
  /** ...and the same set again at `FAR`, on `FAR_CELL`: the borrow's and the
   * crossing's look, answered without walking. Its own coarse cell keeps the
   * dilation cheap — the reach is five times `NEAR`'s, and spreading that
   * over the fine grid would be twenty-five times the cells to fill. */
  const farReach = new Set<number>();
  const seenFar = new Set<number>();
  const rings = Math.ceil(NEAR / INDEX_CELL);
  const farRings = Math.ceil(FAR / FAR_CELL);
  for (const road of roads) {
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i];
      const fx = Math.floor(p.x / FAR_CELL);
      const fz = Math.floor(p.z / FAR_CELL);
      const farKey = cellKey(fx, fz);
      if (!seenFar.has(farKey)) {
        seenFar.add(farKey);
        for (let dx = -farRings - 1; dx <= farRings + 1; dx++) {
          for (let dz = -farRings - 1; dz <= farRings + 1; dz++) {
            farReach.add(cellKey(fx + dx, fz + dz));
          }
        }
      }
      const ix = Math.floor(p.x / INDEX_CELL);
      const iz = Math.floor(p.z / INDEX_CELL);
      const key = cellKey(ix, iz);
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push({ road, index: i });
        continue;
      }
      grid.set(key, [{ road, index: i }]);
      for (let dx = -rings - 1; dx <= rings + 1; dx++) {
        for (let dz = -rings - 1; dz <= rings + 1; dz++) inReach.add(cellKey(ix + dx, iz + dz));
      }
    }
  }
  const nearest = (
    x: number,
    z: number,
    except?: Highway,
    within = Infinity,
    only?: HighwayKind,
  ): HighwayHit | null => {
    if (roads.length === 0) return null;
    const cx = Math.floor(x / INDEX_CELL);
    const cz = Math.floor(z / INDEX_CELL);
    // The tighter set first and ONLY: a point inside `NEAR`'s reach is
    // inside `FAR`'s by construction, so asking both of the probe query —
    // the one asked a million times a stage — is a lookup that can never
    // say anything.
    if (within <= NEAR) {
      if (!inReach.has(cellKey(cx, cz))) return null;
    } else if (
      within <= FAR &&
      !farReach.has(cellKey(Math.floor(x / FAR_CELL), Math.floor(z / FAR_CELL)))
    ) {
      return null;
    }
    let best: HighwayHit | null = null;
    // Out ring by ring until the ring itself cannot beat what is in hand —
    // or beat what the caller asked for, which is what bounds the walk
    // before there is anything in hand at all.
    for (let ring = 0; ring < 64; ring++) {
      const bar = best ? best.d : within;
      if ((ring - 1) * INDEX_CELL >= bar) break;
      for (let dx = -ring; dx <= ring; dx++) {
        const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
        for (let dz = -ring; dz <= ring; dz += stride) {
          const bucket = grid.get(cellKey(cx + dx, cz + dz));
          if (bucket === undefined) continue;
          for (const entry of bucket) {
            if (entry.road === except) continue;
            if (only !== undefined && entry.road.kind !== only) continue;
            const p = entry.road.points[entry.index];
            const d = Math.hypot(p.x - x, p.z - z);
            if (d > within) continue;
            if (!best || d < best.d) best = { road: entry.road, index: entry.index, d };
          }
        }
      }
    }
    return best;
  };
  return { roads, nearest };
}
