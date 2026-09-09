// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT MAKES A CANDIDATE SEGMENT LEGAL. The sprint search draws a segment,
// walks it, and asks these: does the line fit the country it is crossing
// (R47), does it stay out of the water (R35), does it stand on ground a
// road can be built on (R23/R34), is it clear of the tarmac it has not
// turned onto (R17), does a jump on it land on road that is still there
// (R6), does a ford on it have room for its apron (R12). Every one is a
// question about a line already drawn, which is why they are here and the
// drawing is not: `generate.ts` decides WHAT to try, this decides whether
// what it tried is allowed.
//
// They are made as a bundle rather than exported one by one because they
// share the walk's own state — the height profile the road is following and
// the two ledgers a backtrack has to unwind (the committed heights, and the
// places the route has met a public road).

import { landUnder, type LandField } from "./land.ts";
import { STAGE_RULES as R, type SegmentPlan, type StageKnobs } from "./rules.ts";
import { probePoints, type Bore, type Cursor, type Profile, type StartGround } from "./search.ts";
import { valleyUnder } from "./terrain.ts";
import { altitudeScale, landOf } from "./rules.ts";
import type { HighwayNetwork } from "./highway.ts";

export type RouteChecks = ReturnType<typeof createRouteChecks>;

/** Build the bundle for one search attempt. Everything it closes over is
 * settled before the first segment is drawn; `profile` is the one live
 * object — the road's height as the walk stands now, mutated in place. */
export function createRouteChecks(deps: {
  knobs: StageKnobs;
  land: LandField;
  rolling: (s: number) => number;
  groundAt: (x: number, z: number, roll: number) => number;
  profile: Profile;
  grade: number;
  clear: number;
  shelfEnd: number;
  network: HighwayNetwork;
  routeClear: number;
  fillScale: number;
  country: ReturnType<typeof landOf>;
  /** R6 — where the last committed jump's lip ended, m along the route.
   * A `let` on the search's side, so it is read through rather than
   * copied: a ford's apron has to clear whatever the walk has committed
   * by the time it is asked. */
  lastLipEnd: () => number;
}) {
  const { knobs, land, rolling, groundAt, profile, grade, clear, shelfEnd } = deps;
  const { network, routeClear, fillScale, country, lastLipEnd } = deps;
  /** R47 — how much deeper the road may be CUT in this country than the
   * hillsides R34 measured its cap on: the flank's own grade against the
   * tuned country's (`altitudeScale`). A shelf on a face is blasted, and
   * held to a forest road's twenty-four metres the search draws a line
   * across a mountain, is refused it, and walks the pocket until its
   * iterations run out — every candidate on a steep flank asks for a cut
   * because the flank falls away faster than any road may.
   *
   * The FILL side is untouched on purpose, and the asymmetry is the point:
   * the same cap that reads as a blasted face on the uphill side reads as
   * a hundred-metre mesa on the downhill one, and the drop off the edge of
   * it is a wall rather than the mountain the stage is supposed to fall
   * down. */
  const cutScale = altitudeScale(knobs).grade;
  /** R24 in height — the start's own ground, for the arm that comes back
   * past its apron (`entersStart`). */
  const start: StartGround = { y: profile.y, shelfEnd };
  /** A candidate is walked on a COPY: the search draws several before it
   * keeps one, and a rejected draw must not have moved the road's height.
   * The copy comes back with the points so whichever draw is committed can
   * adopt the height it walked to. */
  const probe = (
    from: Cursor,
    plan: SegmentPlan,
    bore: Bore | null = null,
  ): { points: Cursor[]; end: Cursor; walked: Profile } => {
    const walked: Profile = { ...profile };
    return {
      ...probePoints(from, plan, { profile: walked, groundAt, rolling, grade, bore }),
      walked,
    };
  };
  /** R47 — how far the road's BASE stands off the bare land at a probe
   * point, m: positive on fill, negative in cut. What `sitsOnTheLand`
   * judges, and what the steer reads. */
  const offLand = (p: Cursor): number =>
    p.y === undefined || p.rollS === undefined
      ? 0
      : p.y - rolling(p.rollS) - landUnder(land, p.x, p.z);
  /** R47 — how badly a candidate FITS the country: the furthest its base
   * stands off the land anywhere along it, plus a charge for climbing,
   * because a mountain stage is a road coming down off a mountain and a
   * corner that turns uphill is a corner that turns away from where the
   * stage is going. The search reads it when it chooses which way a corner
   * turns, and only then — the rules that decide what is LEGAL are the
   * same ones the taiga is held to. */
  const misfit = (from: Cursor, points: Cursor[], end: Cursor): number => {
    let worst = 0;
    for (const p of points) worst = Math.max(worst, Math.abs(offLand(p)));
    const climb = end.y !== undefined && from.y !== undefined ? end.y - from.y : 0;
    return worst + R.massif.contour.climb * climb;
  };
  /** R12 — A FORD LIES IN ITS VALLEY, and the road dips to it. The water
   * is laid at the bare land's level at the crossing (`fordDip` in
   * compile.ts lays it the same way), and the road comes down to it from
   * wherever its line was running — on a stage rolling over the country,
   * metres up — over an apron as long as that drop needs to stay a ramp.
   * Asked here because the apron has to fit inside the straight, and only
   * the search can draw another straight when it does not.
   *
   * Sized on the walked line — base and roll, the road that gets built —
   * against the same water level the compiler will settle on: the lowest
   * the roll gets across the window, or the land, whichever is lower. The
   * drop is read over the whole room the straight has for an apron, so a
   * ramp that has to reach further up the line is sized for the line it
   * reaches. A bridge is left alone: its deck stands level over the
   * ravine, and the ravine is R13's. */
  const crossingSits = (from: Cursor, plan: SegmentPlan, points: Cursor[]): boolean => {
    if (
      plan.feature !== "water" ||
      plan.featureStart === undefined ||
      plan.featureEnd === undefined
    ) {
      return true;
    }
    const W = R.water;
    const span = plan.featureEnd - plan.featureStart;
    const at = (u: number): Cursor => {
      let best = points[0];
      for (const p of points) {
        if (Math.abs(p.arc - from.arc - u) < Math.abs(best.arc - from.arc - u)) best = p;
      }
      return best;
    };
    /** The road's line at `u` metres into the straight, m. */
    const lineAt = (u: number): number => at(u).y ?? 0;
    /** The ramp a mouth needs to climb or fall `drop` metres, m. */
    const rampFor = (drop: number, least: number): number =>
      Math.max(least, (1.5 * Math.abs(drop)) / W.apronGrade);
    if (plan.crossing !== undefined && plan.crossing !== "ford") {
      // R13 — a DECK holds the road level at the highest of its own line
      // across the crossing, and the road ramps up onto it over a margin
      // at each end: the same arithmetic as a ford's aprons, the other way
      // up, and the same failure when the margin is a fixed length — a
      // road falling away past the far abutment ramped down off the deck
      // at 23%. Each margin is sized to what its mouth has to climb.
      const mid = at(plan.featureStart + span / 2);
      if (mid.y === undefined || mid.rollS === undefined) return true;
      let high = -Infinity;
      for (const p of points) {
        if (p.rollS === undefined) continue;
        const u = p.arc - from.arc;
        if (u < plan.featureStart - R.bridge.margin || u > plan.featureEnd + R.bridge.margin)
          continue;
        high = Math.max(high, rolling(p.rollS));
      }
      const deck = mid.y - rolling(mid.rollS) + high;
      let apronIn: number = R.bridge.margin;
      let apronOut: number = R.bridge.margin;
      for (let round = 0; round < 6; round++) {
        const needIn = rampFor(deck - lineAt(plan.featureStart - apronIn), R.bridge.margin);
        const needOut = rampFor(deck - lineAt(plan.featureEnd + apronOut), R.bridge.margin);
        if (needIn <= apronIn && needOut <= apronOut) break;
        apronIn = Math.max(apronIn, needIn);
        apronOut = Math.max(apronOut, needOut);
        if (apronIn > plan.featureStart || apronOut > plan.length - plan.featureEnd) return false;
      }
      plan.apronIn = apronIn;
      plan.apronOut = apronOut;
      return true;
    }
    /** The two aprons the ford needs with its water starting `start`
     * metres into the straight, or null where the straight has no room
     * for them. Each apron reaches as far as the drop at its mouth needs,
     * and the drop is read at the mouth the apron reaches — and the water
     * is held under BOTH mouths, the way `fordDip` holds it, so a road on
     * a grade puts its water at the lower mouth and the far apron carries
     * the whole fall. A few rounds settle it, from the shortest apron there
     * is outward; a grade the aprons cannot catch up with (each metre of
     * apron adds more fall than it takes) never settles, and the ford does
     * not fit. */
    type Aprons = { apronIn: number; apronOut: number; drop: number };
    const fits = (start: number): Aprons | null => {
      const mid = at(start + span / 2);
      if (mid.y === undefined || mid.rollS === undefined) {
        return { apronIn: W.apron, apronOut: W.apron, drop: 0 };
      }
      let low = Infinity;
      for (const p of points) {
        if (p.rollS === undefined) continue;
        if (p.arc < from.arc + start - W.apron || p.arc > from.arc + start + span + W.apron)
          continue;
        low = Math.min(low, rolling(p.rollS));
      }
      // The valley: the land at the crossing, read across the road too.
      const valley = valleyUnder(mid, land.surfaceAt);
      const wanted = Math.min(mid.y - rolling(mid.rollS) + low, valley);
      let apronIn: number = W.apron;
      let apronOut: number = W.apron;
      let water = wanted - W.bedDepth;
      for (let round = 0; ; round++) {
        water =
          Math.min(wanted, lineAt(start - apronIn), lineAt(start + span + apronOut)) - W.bedDepth;
        let dropIn = 0;
        let dropOut = 0;
        for (const p of points) {
          if (p.y === undefined) continue;
          const u = p.arc - from.arc;
          if (u >= start - apronIn && u <= start) dropIn = Math.max(dropIn, p.y - water);
          if (u >= start + span && u <= start + span + apronOut) {
            dropOut = Math.max(dropOut, p.y - water);
          }
        }
        const needIn = rampFor(dropIn, W.apron);
        const needOut = rampFor(dropOut, W.apron);
        if (needIn <= apronIn && needOut <= apronOut) break;
        if (round >= 6) return null;
        apronIn = Math.max(apronIn, needIn);
        apronOut = Math.max(apronOut, needOut);
        if (apronIn > start || apronOut > plan.length - start - span) return null;
      }
      return { apronIn, apronOut, drop: mid.y - water };
    };
    /** A FORD here: aprons that fit, and a dip no deeper than a ford's. */
    const asFord = (start: number): Aprons | null => {
      const aprons = fits(start);
      return aprons !== null && aprons.drop <= W.culvert.fordDrop ? aprons : null;
    };
    let start = plan.featureStart;
    let aprons = asFord(start);
    if (aprons === null) {
      // No room where the dice put it: the middle of the straight is where
      // a ford has the most, and the draw was only ever a place inside the
      // window the rules allow (`assignCrossing`) — the jump before it
      // still keeps its clearance.
      const centre = (plan.length - span) / 2;
      const earliest = Math.max(W.apron, lastLipEnd() + W.clearAfterJump - from.arc);
      if (centre >= earliest) {
        aprons = asFord(centre);
        if (aprons !== null) start = centre;
      }
    }
    if (aprons !== null) {
      plan.featureStart = start;
      plan.featureEnd = start + span;
      plan.apronIn = aprons.apronIn;
      plan.apronOut = aprons.apronOut;
      return true;
    }
    // R12 — no ford here: a CULVERT, if the road stands over the water by
    // the pipe's cover. The road keeps its line and the stream goes under
    // it, which is what a road does over a stream it cannot afford to dip
    // to. Lower than that over water it cannot dip to, there is no
    // crossing here and the search draws another straight.
    const mid = at(plan.featureStart + span / 2);
    if (mid.y === undefined) return true;
    const valley = valleyUnder(mid, land.surfaceAt);
    if (mid.y - (valley - W.bedDepth) < W.culvert.cover) return false;
    const centre = plan.featureStart + span / 2;
    plan.crossing = "culvert";
    plan.featureStart = centre - W.culvert.span / 2;
    plan.featureEnd = centre + W.culvert.span / 2;
    return true;
  };
  /** ...and a backtrack has to put it back, so every committed segment's
   * starting height is kept beside its plan. */
  const heights: Profile[] = [];
  /** Undo one committed segment's worth of height. */
  const rewind = (): void => {
    const was = heights.pop();
    if (!was) return;
    profile.y = was.y;
    profile.slope = was.slope;
    profile.rollS = was.rollS;
  };
  /** R35 — the line keeps out of the water. A candidate whose probe points
   * come within the route's clearance of a lake's surface is refused like
   * any other rule violation: redrawn, then backtracked out of, never
   * repaired. Repairing it is what the terrain used to do, and what a
   * terrain does when handed a road through a lake is build a causeway. */
  const keepsDry = (p: Cursor): boolean => {
    if (land.nearOpenWater(p.x, p.z, routeClear)) return false;
    // ...and its SURFACE stays over the water beside it. The road's height
    // follows the country through a lag, and the freeboard it keeps over a
    // lake is only asked for where the lake is already in view: a road
    // running down into a cutting beside one arrived under the lake's
    // level before the lag had lifted it, and the pour flooded the trench.
    // A line the road can only take under the water is refused here, where
    // another can still be drawn.
    if (p.y === undefined) return true;
    //
    // R48 — none of which applies to a body that has frozen solid, which is
    // why the reading is the OPEN water's: the sheet IS the road's ground,
    // and a line held a metre above it is a line that can never get onto
    // the lake at all.
    const level = land.openShoreLevelAt(p.x, p.z);
    if (level !== null && p.y < level + R.water.underLake) return false;
    // ...and where it crosses ice it crosses it LOW. The follower brings
    // the road down to the country through a lag longer than most lakes are
    // wide, so a line that reaches a shore metres up is still up there at
    // the far side — a causeway over a frozen lake, which is the one thing
    // R35 exists to prevent. Refused here, where another line can still be
    // drawn; what gets through goes on over a bank and lands on the sheet.
    const ice = land.iceAt(p.x, p.z);
    return ice === null || Math.abs(p.y - ice) <= R.ice.lift;
  };
  /** R48 — ...and a corner ON the ice is a gentle one. The lake carries
   * the sweeper and the straight; everything tighter than
   * `R.ice.minRadius` is refused there and drawn on the land instead. */
  const holdsOnIce = (plan: SegmentPlan, points: Cursor[]): boolean => {
    if (plan.kind !== "turn" || (plan.radius ?? Infinity) >= R.ice.minRadius) return true;
    return !points.some((p) => land.nearIce(p.x, p.z, R.ice.cornerClear));
  };
  /** R34 — and it keeps within reach of the ground. A line the road can
   * only take by standing twenty-odd metres off the country is refused
   * here, where another line can still be drawn, rather than left to the
   * terrain — which has no good answer to it. */
  /** R34/R47 — ...and BEFORE that, whether there is ground here a road
   * could be benched into at all: the bare land's own grade at the probe,
   * against `maxLandGrade`. Differenced over the road's own clearance
   * rather than a fine step, because what the rule is about is the ground
   * a whole corridor has to sit on, not a lattice cell's facet. */
  const standsOnGround = (p: Cursor): boolean => {
    const h = clear / 2;
    const dx = (land.heightAt(p.x + h, p.z) - land.heightAt(p.x - h, p.z)) / clear;
    const dz = (land.heightAt(p.x, p.z + h) - land.heightAt(p.x, p.z - h)) / clear;
    return Math.hypot(dx, dz) <= R.elevation.maxLandGrade;
  };
  const sitsOnTheLand = (p: Cursor): boolean => {
    if (!standsOnGround(p)) return false;
    if (p.y === undefined || p.rollS === undefined || fillScale <= 0) return true;
    // The BASE against the land — the road's own roll rides on top of it
    // either way, and the caps were measured on the base: held against the
    // surface, the roll's swing tightened them by up to six metres and the
    // search refused thirty times the candidates for it.
    const off = offLand(p);
    const scale = fillScale * country.earthworks;
    return off <= R.elevation.maxFill * scale && -off <= R.elevation.maxCut * scale * cutScale;
  };
  /** R47 — ...except INSIDE A BORE, where the country standing over the
   * road is the whole point. Everything outside the bore on the same
   * straight — the approach, the portals, the run out of the far one — is
   * held to the cap like any other road. */
  const sitsOrBored = (from: Cursor, plan: SegmentPlan, p: Cursor): boolean => {
    if (
      plan.feature === "tunnel" &&
      plan.featureStart !== undefined &&
      plan.featureEnd !== undefined
    ) {
      const u = p.arc - from.arc;
      if (u >= plan.featureStart && u <= plan.featureEnd) return true;
    }
    return sitsOnTheLand(p);
  };
  /** R17 + R23 — AND IT NEVER WANDERS ACROSS THE TARMAC. The sealed roads
   * were laid across this country before the rally was routed over it, and a
   * rally stage does not drive along a public road by accident: it meets one
   * at a junction and runs it, or it goes square over it and away (R36). So
   * the same clearance that keeps two roads apart keeps the gravel off the
   * tarmac, and the only two ways through it are `planBorrow` and
   * `planCrossing` below — each of which waives this for the road it is
   * meeting, and for that one only.
   *
   * The only ground exempt from it is a PLACE where the two roads meet:
   * `meets` holds the meeting point of every junction and every crossing the
   * route has made, with the reach that place is one road over. Even a
   * borrow in progress is held to it — the stretches that RUN ALONG the road
   * are exempt because they are on it by construction, and the corners either
   * side of them are ordinary rally road. */
  /** ...and the meeting points of every junction and crossing the route has
   * already made, where the two roads ARE one road. `parting` is per meet
   * because the two kinds of place are two different sizes for two different
   * reasons: a junction's has to cover two carriageways peeling apart
   * through a corner (`STAGE_RULES.junction.parting`, the same exemption a
   * branch leaving one gets), and a crossing's has to cover a straight going
   * over a mat (`crossingParting`). Without it the corner off the tarmac is
   * refused by the road it is turning off, and the passage over one by the
   * road it is passing over. */
  const meets: { x: number; z: number; arc: number; at: number; parting: number }[] = [];
  const clearOfTarmac = (p: Cursor): boolean => {
    const hit = network.nearest(p.x, p.z, undefined, clear);
    if (hit === null) return true;
    // BOTH ROADS have to be in the crossing, and the route's end of it is
    // measured along its OWN ARC. A junction is a place the route passes
    // through once; ask only whether the piece of TARMAC is near a meeting
    // point and a route that left the crossing, ran a hundred and fifty
    // metres and came back alongside the same road is still exempt, because
    // the road it is beside is still near where it turned off. That is seed
    // 10's medium: two metres from the middle of a public road, a hundred
    // and forty-seven metres of stage after leaving it.
    const at = hit.road.points[hit.index];
    return meets.some(
      (m) => Math.abs(p.arc - m.arc) < m.parting && Math.hypot(at.x - m.x, at.z - m.z) < m.parting,
    );
  };
  /** R6 — A JUMP LANDS ON ROAD THAT IS STILL THERE. The lip throws the car
   * by its own height, and every metre the road falls away under the
   * flight is a metre more of it: a ramp at the gentle end of the band on
   * a road running downhill came out as a ninety-metre jump. So the line
   * past the lip may not stand more than `jump.landingFall` under the
   * lip's own base anywhere in the landing zone — read off the walked
   * line, which is the road that gets built. */
  const jumpLands = (from: Cursor, plan: SegmentPlan, points: Cursor[]): boolean => {
    if (plan.feature !== "jump" || plan.featureEnd === undefined) return true;
    const lipArc = from.arc + plan.featureEnd;
    let lipY: number | null = null;
    for (const p of points) {
      if (p.y === undefined) return true;
      if (lipY === null) {
        if (p.arc >= lipArc) lipY = p.y;
        continue;
      }
      if (p.arc > lipArc + R.jump.landing) break;
      if (lipY - p.y > R.jump.landingFall) return false;
    }
    return true;
  };
  return {
    start,
    probe,
    offLand,
    misfit,
    crossingSits,
    heights,
    rewind,
    keepsDry,
    holdsOnIce,
    standsOnGround,
    sitsOnTheLand,
    sitsOrBored,
    meets,
    clearOfTarmac,
    jumpLands,
  };
}
