// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SPRINT SEARCH: a rules engine that assembles a stage from the segment
// vocabulary in rules.ts while enforcing every R-rule. Candidate segments
// are drawn from the seeded RNG and validated against the world bounds (R9),
// the self-distance rule (R10/R23) and the start zone (R24); a candidate
// that fails is re-drawn a bounded number of times, then the generator
// backtracks one segment rather than shipping a violation. The result is a
// deterministic function of the seed.
//
// The other two searches are its siblings, not its subroutines: circuits
// (R22) close back onto their own start line in circuit.ts, and the endless
// stream appends sections forever in endless.ts. Everything all three share
// — the cursor, the point field, the draws — is in search.ts.

import { createRng } from "../lib/prng.ts";
import {
  STAGE_RULES as R,
  type FiniteStageLength,
  type SegmentPlan,
  type StageKnobs,
  type StageShape,
} from "./rules.ts";
import { knobScale, resolveKnobs } from "./rules.ts";
import { generateCircuit } from "./circuit.ts";
import { createLandField, type LandField } from "./land.ts";
import { ROAD_CROSS, roadClearance } from "./road.ts";
import { buildRolling } from "./rolling.ts";
import { valleyUnder } from "./terrain.ts";
import {
  createHighwayNetwork,
  layHighways,
  layRailways,
  type Highway,
  type HighwayKind,
  type HighwayNetwork,
} from "./highway.ts";
import { planBorrow } from "./borrow.ts";
import { crossingParting, planCrossing } from "./crossing.ts";
import {
  PROBE_STEP,
  assignFeature,
  createPointField,
  drawTurn,
  entersStart,
  inBounds,
  probePoints,
  recomputeSameDirRun,
  straightLength,
  straightRunAt,
  trackRun,
  type Cursor,
  type Profile,
  type SameDirRun,
} from "./search.ts";

/** Generate a finite stage plan from a seed, sized for `length`'s band.
 * Deterministic; always satisfies the R-rules. A search that boxes itself
 * in so badly that even the closing straight cannot be placed legally is
 * retried with a derived sub-seed — still a pure function of the seed.
 *
 * R22 — `shape` picks which search runs. A sprint runs from a start to a
 * finish somewhere else (the search below); a circuit closes back onto its
 * own start line so the stage can be raced over laps (circuit.ts). */
export function generateStage(
  seed: number,
  length: FiniteStageLength = "medium",
  knobs?: Partial<StageKnobs>,
  shape: StageShape = "sprint",
): SegmentPlan[] {
  const dials = resolveKnobs(knobs);
  if (shape === "circuit") return generateCircuit(seed, length, dials);
  // R35 — the country, and the water standing on it, BEFORE the first
  // segment is drawn. Built once from the stage's own seed rather than per
  // attempt: the landscape is not what a retry is retrying, and the pour
  // it caches is what makes asking "is this line in a lake" cheap enough
  // to ask of every probe point of every candidate.
  const land = createLandField(seed, dials);
  // R17 — and THE TARMAC, before the first segment of rally is drawn. A
  // sealed road is not a stripe painted down the racing line: it is a
  // public road that was there first and goes somewhere, and the rally
  // borrows a kilometre of it. Laying it here is what makes that true —
  // the search plans AROUND these roads (it may never cross one) and ONTO
  // them (`planBorrow`), instead of the surface being decided afterwards.
  const network = createHighwayNetwork(layStageHighways(seed, dials, land, length));
  // R34 — and the road's own roll, from the stage's seed and never a
  // retry's: the compiler lays this exact roll on whichever attempt wins,
  // so the height the search judges is the road that gets built.
  const rolling = buildRolling(seed, dials);
  const ladder = R.water.routeClearLadder;
  for (let attempt = 0; attempt < 40; attempt++) {
    // The setback the water is given, relaxing as the attempts run out:
    // most of them at the full standard, the last of them at none. A
    // country that is mostly lake still has to produce a stage.
    const rung = Math.floor((attempt * ladder.length) / 40);
    const clearance =
      R.water.routeClear * ladder[rung] * knobScale(dials.water, R.wet.routeSetback);
    const plans = tryGenerateStage(
      (seed + attempt * 0x9e3779b9) >>> 0,
      length,
      dials,
      land,
      rolling,
      network,
      clearance,
      R.elevation.fillLadder[rung],
    );
    if (plans) return plans;
  }
  throw new Error(`stage generation failed for seed ${seed} (${length})`);
}

/** R17 — the TARMAC a seed's country carries, laid before the rally is
 * routed across it and rebuilt identically wherever it is asked for.
 *
 * It is a pure function of the seed, the dials and the length's box, which
 * is what lets the search plan around the roads and the compiler then build
 * the pieces of them the stage touches without either having to hand the
 * other a list. */
export function layStageHighways(
  seed: number,
  knobs: StageKnobs,
  land: LandField,
  length: FiniteStageLength,
): Highway[] {
  const bound = R.stageLengths[length].worldBound;
  const width = knobScale(knobs.width, R.roadWidth);
  const roads = layHighways(seed, knobs, land, bound, width);
  // R41 — and the railway, after the roads so it keeps off them.
  return [...roads, ...layRailways(seed, knobs, land, bound, width, roads)];
}

function tryGenerateStage(
  seed: number,
  length: FiniteStageLength,
  knobs: StageKnobs,
  land: LandField,
  rolling: (s: number) => number,
  network: HighwayNetwork,
  routeClear: number,
  fillScale: number,
): SegmentPlan[] | null {
  const spec = R.stageLengths[length];
  const rng = createRng(seed);
  const plans: SegmentPlan[] = [];
  // R23 — the whole search is measured in the road's own clearance, which
  // is what the width dial makes of it.
  const width = knobScale(knobs.width, R.roadWidth);
  const clear = roadClearance(width);
  const shelfEnd = width / 2 + ROAD_CROSS.reach;
  const field = createPointField(clear, shelfEnd);
  /** R23 — the road's own height as the search walks it, so the rule can
   * ask how far apart two arms are vertically as well as on the map. The
   * ground it follows is what the road may be BUILT on, water's freeboard
   * included, which is the same thing the compiler follows — and the roll
   * the compiler will lay on it is the same roll, from the same seed, so
   * the height the search judges is the road's own surface (R34). */
  const groundAt = (x: number, z: number, roll: number): number => {
    const ground = land.heightAt(x, z);
    const water = land.water.shoreLevelAt(x, z);
    return water === null ? ground : Math.max(ground, water + R.elevation.follow.freeboard - roll);
  };
  const profile: Profile = { y: groundAt(0, 0, rolling(0)), slope: 0, rollS: 0 };
  /** A candidate is walked on a COPY: the search draws several before it
   * keeps one, and a rejected draw must not have moved the road's height.
   * The copy comes back with the points so whichever draw is committed can
   * adopt the height it walked to. */
  const probe = (
    from: Cursor,
    plan: SegmentPlan,
  ): { points: Cursor[]; end: Cursor; walked: Profile } => {
    const walked: Profile = { ...profile };
    return { ...probePoints(from, plan, { profile: walked, groundAt, rolling }), walked };
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
      const earliest = Math.max(W.apron, sLastLipEnd + W.clearAfterJump - from.arc);
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
    if (land.nearWater(p.x, p.z, routeClear)) return false;
    // ...and its SURFACE stays over the water beside it. The road's height
    // follows the country through a lag, and the freeboard it keeps over a
    // lake is only asked for where the lake is already in view: a road
    // running down into a cutting beside one arrived under the lake's
    // level before the lag had lifted it, and the pour flooded the trench.
    // A line the road can only take under the water is refused here, where
    // another can still be drawn.
    if (p.y === undefined) return true;
    const level = land.water.shoreLevelAt(p.x, p.z);
    return level === null || p.y >= level + R.water.underLake;
  };
  /** R34 — and it keeps within reach of the ground. A line the road can
   * only take by standing twenty-odd metres off the country is refused
   * here, where another line can still be drawn, rather than left to the
   * terrain — which has no good answer to it. */
  const sitsOnTheLand = (p: Cursor): boolean => {
    if (p.y === undefined || p.rollS === undefined || fillScale <= 0) return true;
    // The BASE against the land — the road's own roll rides on top of it
    // either way, and the caps were measured on the base: held against the
    // surface, the roll's swing tightened them by up to six metres and the
    // search refused thirty times the candidates for it.
    const off = p.y - rolling(p.rollS) - land.heightAt(p.x, p.z);
    return off <= R.elevation.maxFill * fillScale && -off <= R.elevation.maxCut * fillScale;
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
  let cursor: Cursor = { x: 0, z: 0, heading: 0, arc: 0 };
  let total = 0;
  let sLastLipEnd = -Infinity;
  const sameDirRun: SameDirRun = { dir: 0, count: 0, angle: 0 };

  const commit = (plan: SegmentPlan, points: Cursor[], end: Cursor, walked?: Profile): void => {
    heights.push({ ...profile });
    if (walked) {
      profile.y = walked.y;
      profile.slope = walked.slope;
      profile.rollS = walked.rollS;
    }
    if (plan.feature === "jump") {
      sLastLipEnd = total + (plan.featureEnd ?? plan.length);
    }
    plans.push(plan);
    field.add(points);
    cursor = end;
    total += plan.length;
    trackRun(sameDirRun, plan);
  };

  /** Undo one committed segment — the backtrack's own move, named because
   * a borrow that fails half way through has to make it too, and because
   * everything a borrow leaves BESIDE the plan list has to come back with
   * it. A junction's exemption that outlived the junction is how the route
   * came to drive nineteen metres from a public road on seed 5: the borrow
   * was placed, the search later retreated through it, and the meeting
   * points stayed behind waiving R23 for the rest of the stage. */
  const uncommit = (): void => {
    const dropped = plans.pop();
    if (!dropped) return;
    field.removeLast(Math.max(1, Math.ceil(dropped.length / PROBE_STEP)));
    total -= dropped.length;
    if (dropped.paved) sealed -= dropped.length;
    // R17/R36 — A BUNDLE COMES OUT WHOLE. Its pieces were validated
    // together, and the ones that lead up to the meeting point were
    // validated with R23 waived for the road they lead to (`meets`). Drop
    // the tail of a borrow and keep its approach and the route is left
    // running up to a public road and turning away from it, on ground it was
    // only ever allowed because it was going to join there — seed 7's medium
    // came within six metres of the middle of one that way, on a stage with
    // no junction on it at all. A crossing is the same argument with a
    // sharper edge: keep the approach without the passage and the route
    // walks up to a public road, straightens up square on it, and turns away
    // along it, which is R23's whole subject.
    while (bundles.length > 0) {
      const span = bundles[bundles.length - 1];
      if (plans.length >= span.to) break;
      while (plans.length > span.from) {
        const more = plans.pop();
        if (!more) break;
        field.removeLast(Math.max(1, Math.ceil(more.length / PROBE_STEP)));
        total -= more.length;
        if (more.paved) sealed -= more.length;
        rewind();
      }
      bundles.pop();
    }
    // `>=`, not `>`: a bundle records its meeting points at the plan length
    // it STARTS from, so a retreat that has undone the whole of one leaves
    // the two equal. With a strict compare the crossing outlived the
    // crossing — seed 10 kept waiving R23 around a junction it no longer
    // had, and the route drove two metres from the middle of a public road.
    rewind();
    while (meets.length > 0 && meets[meets.length - 1].at >= plans.length) meets.pop();
    cursor = { ...field.points[field.points.length - 1] };
  };

  /** R17/R36 — take a whole BUNDLE or none of it: a set of segments that
   * were solved together and only mean anything together. A borrow is one (a
   * route left standing on a public road it never turns off is not a stage)
   * and so is a crossing (an approach without its passage is a route lined
   * up square on a road it then drives away along). So they are validated in
   * sequence — each against the world, the water, the land and every OTHER
   * public road — and the first one that will not fit unwinds the lot.
   *
   * The caller pushes the bundle's MEETING POINTS onto `meets` before
   * calling, and hands back the mark it took first, because the exemption
   * has to be in force while the approach is being validated: the approach
   * is inside the clearance of the road it is meeting from the moment it
   * sets out for it. Those meeting points then stay exempt for the rest of
   * the search, because the route leaving one is inside that clearance until
   * the two have parted, exactly as a branch is. */
  const commitBundle = (bundle: SegmentPlan[], marks: number): boolean => {
    const took: SegmentPlan[] = [];
    const undo = (): false => {
      for (let i = 0; i < took.length; i++) {
        const more = plans.pop();
        if (!more) break;
        field.removeLast(Math.max(1, Math.ceil(more.length / PROBE_STEP)));
        total -= more.length;
        rewind();
        cursor = { ...field.points[field.points.length - 1] };
      }
      meets.length = marks;
      recomputeSameDirRun(plans, sameDirRun);
      return false;
    };
    for (const plan of bundle) {
      if (total + plan.length > spec.band.max - R.closingStraight) break;
      // R5 — a bundle's own corners are the RALLY's corners (only the
      // pieces of road a borrow runs along are exempt), so they are held to
      // the same-direction cap like any drawn turn. `planBorrow` and
      // `planCrossing` solve geometry and know nothing about what the route
      // has been doing for the last three segments; without this an approach
      // could arrive through a third corner the same way and put a spiral in
      // a stage.
      if (plan.kind === "turn" && !plan.paved && plan.dir === sameDirRun.dir) {
        const angle = plan.length / (plan.radius ?? 1);
        if (
          sameDirRun.count + 1 > R.maxSameDirectionTurns ||
          sameDirRun.angle + angle > R.maxSameDirectionAngle
        ) {
          break;
        }
      }
      const { points, end, walked } = probe(cursor, plan);
      if (!points.every((p) => inBounds(p, spec.worldBound))) break;
      if (
        points.some(
          (p) =>
            field.blocked(p) ||
            entersStart(p, clear) ||
            !keepsDry(p) ||
            !sitsOnTheLand(p) ||
            // The pieces that RUN ALONG the road are on it by definition;
            // everything else in a bundle is ordinary rally road and
            // keeps R23's distance from the tarmac like any other — the
            // passage over a crossing included, which is exempt through its
            // own meeting point rather than through a flag.
            (!plan.paved && !clearOfTarmac(p)),
        )
      ) {
        break;
      }
      commit(plan, points, end, walked);
      took.push(plan);
    }
    if (took.length !== bundle.length) return undo();
    for (const plan of took) if (plan.paved) sealed += plan.length;
    bundles.push({ from: plans.length - took.length, to: plans.length });
    return true;
  };

  /** R17 — a BORROW: the two places it makes the route and the road one
   * road, noted before anything is validated so the approach is measured
   * against the same exemption every other segment of the stage is.
   *
   * Waiving the whole road for the whole borrow instead is what let a route
   * run a hundred and fifty metres down the side of the tarmac it was about
   * to join: seed 10 at medium came within a metre and a half of the middle
   * of a public road, a hundred metres from its crossing, and neither the
   * search nor the analysis said a word. The road being joined is exempt AT
   * THE CROSSING and nowhere else, exactly like the branch that leaves it. */
  const commitBorrow = (borrow: NonNullable<ReturnType<typeof planBorrow>>): boolean => {
    const road = network.roads[borrow.road];
    const marks = meets.length;
    // Where along the STAGE each crossing falls: the entry is the end of the
    // approach's turn-straight-turn, the exit the end of the run along the
    // road (everything but the corner off it).
    const runs = borrow.plans.map((plan) => plan.length);
    const upTo = (n: number): number => runs.slice(0, n).reduce((a, b) => a + b, total);
    const parting = R.junction.parting;
    meets.push({ ...road.points[borrow.from], arc: upTo(3), at: plans.length, parting });
    meets.push({
      ...road.points[borrow.to],
      arc: upTo(runs.length - 1),
      at: plans.length,
      parting,
    });
    return commitBundle(borrow.plans, marks);
  };

  /** R36 — a CROSSING: one meeting point, in the middle of the straight that
   * goes over the road. The approach is inside the tarmac's clearance from
   * the corner that aims it there onward, so the exemption goes on before
   * any of it is validated — and it is `crossingParting` wide rather than a
   * junction's, because what it has to forgive is a straight passing over a
   * mat and nothing else. */
  const commitCrossing = (crossing: NonNullable<ReturnType<typeof planCrossing>>): boolean => {
    const road = network.roads[crossing.road];
    const marks = meets.length;
    const runs = crossing.plans.map((plan) => plan.length);
    const before = runs.slice(0, runs.length - 1).reduce((a, b) => a + b, total);
    const arc = before + crossing.at;
    meets.push({
      ...road.points[crossing.index],
      arc,
      at: plans.length,
      parting: crossingParting(width, road.kind),
    });
    if (!commitBundle(crossing.plans, marks)) return false;
    // R41 — a railway crossing's straight carries a real lip, and `commit`
    // has already booked it as one.
    if (road.kind === "rail") return true;
    // R6/R36 — AND THE CROSSING IS A LIP, for spacing's purposes.
    //
    // R6 keeps two jump lips `jump.minSpacing` apart because two launches
    // inside a couple of hundred metres is one long moment of nobody
    // steering. A crossing carries no lip flag — the step is the public
    // road's formation rather than a feature the generator laid (R36) — and
    // it throws the car in exactly the same way, so the rule has to bind it
    // or a jump lands two hundred metres from a crossing and the pair are
    // the thing R6 exists to prevent, wearing a different name.
    //
    // Measured from the far ramp's TOE, which is where the car comes back
    // down: the arc position of the meeting point plus the platform's own
    // flat top and the ramp past it (the compiler's `crossingRamp`).
    sLastLipEnd = arc + 0.72 * width * 0.85 + R.crossing.ramp;
    return true;
  };

  // R1 — opening straight (never carries a feature: it is the start grid).
  // Long enough for a heads-up field to string out on: `launch.run` from
  // the gate, and never shorter than the vocabulary's own opening.
  const opening: SegmentPlan = {
    kind: "straight",
    length: Math.max(R.openingStraight, R.launch.run) + rng.range(0, 40),
    feature: "none",
  };
  {
    const { points, end, walked } = probe(cursor, opening);
    // R34 — the opening is the one segment no search chose, so it is also
    // the one nothing was checking. It is laid from the origin whatever the
    // country there does, and where that country falls away it left the
    // grid on the tallest fill on the map — the worst wall beside a road on
    // a twelve-seed sweep was on a start straight, not on a stage. Siting
    // (R35) puts the origin on dry ground but says nothing about what the
    // next two hundred metres do, so the same rule the rest of the route
    // keeps has to bind here too. There is no redrawing it: the attempt is
    // rejected and the sub-seed loop tries another country.
    if (!points.every(sitsOnTheLand) || !points.every(clearOfTarmac)) return null;
    commit(opening, points, end, walked);
  }

  const targetLength = rng.range(spec.band.min, spec.band.max) - R.closingStraight;

  // A boxed-in search can place-and-backtrack around the same pocket for a
  // very long time (a random walk with no exit). Normal stages assemble in
  // well under a thousand iterations; past this cap the attempt is hopeless
  // — reject it and let the caller retry with the next sub-seed. Longer
  // bands earn proportionally more iterations before giving up.
  //
  // The cap is where a hilly seed's time goes: with R23 binding in height
  // the field boxes the walk in more often, and every attempt that runs to
  // the cap is two seconds of walking a pocket with no exit. Halved from
  // `2000 + band.max`, every winning attempt on seeds 1-12, medium and
  // long, is the same attempt (none of them had needed more than this),
  // and the hopeless ones cost half — seed 7 long from 13 s to 9.
  const maxIterations = 1000 + spec.band.max / 2;
  let iterations = 0;

  // R15/R17 — HOW MUCH OF THE STAGE IS TARMAC, and the state that decides
  // when to go looking for some. The `asphalt` dial is the share of the
  // route that should come out sealed (R15), and the only way to seal a
  // metre of route is to be driving on a public road — so the dial is a
  // target the search spends by BORROWING, not a coin it flips per section.
  const wantSealed = knobs.asphalt >= R.paving.floor ? knobs.asphalt * targetLength : 0;
  let sealed = 0;
  /** Where the last borrow let go of the tarmac, m of stage arc. A stage
   * opens on gravel and puts a run of it between two sealed stretches: two
   * junctions back to back are one junction with a kink in it. */
  let leftTarmacAt = 0;
  /** The furthest a `planBorrow` solve can reach — the straight's ceiling
   * plus what its two corners carry. Beyond it there is no solve to find,
   * and the whole cost of a borrow that fails is looking for one, so the
   * cheap `nearest` probe below stands in front of the expensive search. */
  const borrowReach = R.straightLong.max + 4 * R.turn.soft.radius.max;

  /** R17 — go and find a road, and take the whole borrow if one solves.
   *
   * Asked in two situations, and `needed` is which. Normally it is the
   * `asphalt` dial spending its budget: the route is owed some tarmac, it
   * has run enough gravel since the last stretch, and there is a road
   * within reach. But a borrow is also THE WAY PAST A ROAD — the route may
   * not cross one (R23), so a search boxed in against the tarmac has
   * exactly one legal move, which is to join it and leave on the far side.
   * There the dial has no say: the alternative is not less tarmac, it is no
   * stage. */
  /** Where the last failed look for a road was made, m of stage arc. The
   * solve is the expensive thing in the whole search — a few thousand
   * turn-straight-turn closures over every meeting point in reach — and
   * asking it again forty metres further down the same straight asks the
   * same question. A look that found nothing is good for the length of a
   * segment. */
  let lookedAt = -Infinity;
  /** The roads this route has already borrowed — see `tryBorrow`. */
  const used = new Set<number>();
  /** ...and the plan span each committed BUNDLE occupies — a borrow or a
   * crossing — so a retreat that reaches into one takes the whole of it. */
  const bundles: { from: number; to: number }[] = [];
  const tryBorrow = (needed: boolean): boolean => {
    if (!needed && sealed >= wantSealed) return false;
    if (total - lookedAt < R.paving.borrow.look) return false;
    if (total - leftTarmacAt < R.paving.gap.min) return false;
    if (total + R.paving.borrow.runOn.min >= targetLength) return false;
    if (
      !network.nearest(
        cursor.x,
        cursor.z,
        undefined,
        Math.min(R.paving.borrow.seek, borrowReach),
        "road",
      )
    ) {
      return false;
    }
    // How long a stretch to stay on it: what the dial still owes, inside
    // the vocabulary's band, and never so much of what the stage has LEFT
    // that R11 refuses the closing straight afterwards.
    const room = (targetLength - total) * R.paving.borrow.share;
    const owed = needed ? R.paving.borrow.runOn.min : wantSealed - sealed;
    const runOn = Math.max(R.paving.borrow.runOn.min, Math.min(owed, room));
    if (runOn > room) return false;
    // Longest first, then shorter. A borrow is validated whole and dropped
    // whole, so the further the route stays on the road the more chances
    // there are for one of its segments to leave the world or cross the
    // stage's own line — and the dial asking for a long one must not come
    // out as no tarmac at all. Ask for what is owed; settle for what fits.
    for (const want of [runOn, runOn * 0.6, R.paving.borrow.runOn.min]) {
      if (want < R.paving.borrow.runOn.min) break;
      const borrow = planBorrow(
        cursor,
        network,
        width,
        want,
        plans[plans.length - 1].kind === "straight",
      );
      // R17 — ONE BORROW PER ROAD. A rally that meets the same public road
      // twice has gone round in a circle, and the country pays for it
      // twice over: the stretch of tarmac between the two crossings is a
      // single piece of road with an abandoned arm reaching into it from
      // each end, so it is built and drawn twice, two carriageways a couple
      // of metres apart pointing at each other. Over seeds 1-24 that was
      // 82 of the 97 R23 breaches on the sweep.
      if (!borrow || used.has(borrow.road) || !commitBorrow(borrow)) continue;
      used.add(borrow.road);
      leftTarmacAt = total;
      lookedAt = -Infinity;
      return true;
    }
    lookedAt = total;
    return false;
  };

  /** R36 — where the last crossing was made, m of stage arc, and where the
   * last failed look for one was. Two crossings a hundred metres apart is
   * one crossing the route approached twice. */
  let crossedAt = -Infinity;
  let lookedAcross = -Infinity;
  /** R36 — GO STRAIGHT OVER A ROAD THAT IS IN THE WAY.
   *
   * Asked before the dice, like a borrow and for the same reason — a
   * crossing is not one more candidate segment but an approach, a passage
   * and the exemption they share, solved and validated as one piece — and
   * gated much harder, because unlike a borrow nothing ASKS for one. There
   * is no dial that spends on crossings. What justifies one is that the road
   * is in the WAY, so that is what is measured: somewhere down the line the
   * route is pointing along there is tarmac closer than R23 lets the gravel
   * get, which is to say that carrying on this way runs the stage into a
   * public road.
   *
   * Without that gate the seek radius is the gate, and 420 m of it covers
   * most of a map that has a road across it: every stage would cross every
   * road it came near, which is a country of level crossings rather than a
   * country with roads in it.
   *
   * Probed at several distances rather than one, because a route almost
   * never points exactly at anything — it wanders, and where it is going is
   * a stretch of country rather than a point. Asked once, at the far side of
   * one crossing, it fired only on seeds whose aim happened to be perfect:
   * two of twenty-four. */
  const tryCrossing = (needed: boolean, kind: HighwayKind = "road"): boolean => {
    const C = kind === "rail" ? R.rail : R.crossing;
    // R15 — AND THE ASPHALT DIAL HAS FIRST REFUSAL ON THE ROAD.
    //
    // A road can be met once and once only (see `used` below), so the two
    // ways past one are in competition for it — and they are not worth the
    // same. A borrow is what the dial SPENDS: it is the only way a metre of
    // route comes out sealed, and on a country carrying one public road it
    // is the only tarmac the stage will ever have. A crossing is four
    // seconds of jump. Taking the road for the jump while the dial is still
    // owed is spending the whole allowance on the cheaper thing, and it
    // measured exactly that — the sealed share of a medium stage fell under
    // R15's own floor, which is the dial quietly not working.
    //
    // So while the dial is owed, a crossing waits for the borrow to have had
    // its chance at this piece of country: `lookedAt` is where a borrow
    // solve was last tried and did not close, and inside one look's worth of
    // road that is an answer about the road in the way rather than a guess.
    // `needed` is the search boxed in against the tarmac, where the
    // alternative is not less tarmac but no stage.
    // R41 — a railway is nobody's tarmac: the dial has no claim on it.
    if (
      kind === "road" &&
      !needed &&
      sealed < wantSealed &&
      total - lookedAt >= R.paving.borrow.look
    ) {
      return false;
    }
    if (total - lookedAcross < C.look) return false;
    if (total - crossedAt < R.paving.gap.min) return false;
    // R6 — ...and it keeps its distance from a jump lip, the same way one
    // lip keeps its distance from the next. The crossing lands at least a
    // straight past the cursor, so measuring from here is conservative in
    // the direction that matters.
    if (total - sLastLipEnd < R.jump.minSpacing) return false;
    const ahead = 2 * C.clear;
    const inTheWay = [1, 2, 3].some((n) =>
      network.nearest(
        cursor.x + Math.sin(cursor.heading) * ahead * n,
        cursor.z + Math.cos(cursor.heading) * ahead * n,
        undefined,
        clear,
        kind,
      ),
    );
    if (!inTheWay) return false;
    const crossing = planCrossing(
      cursor,
      network,
      plans[plans.length - 1].kind === "straight",
      kind,
    );
    // R36/R23 — ONE MEETING PER ROAD, and it is the same rule the borrow
    // keeps for the same reason: both arms of a crossing are CUT from the
    // road and run to the edge of the map, so a route that meets one road
    // twice leaves two arms reaching into each other along the same piece of
    // tarmac — a single road built and drawn twice, two carriageways a
    // couple of metres apart pointing at each other. Shared with the borrow
    // set, because a road that was borrowed has arms out on it already.
    if (!crossing || used.has(crossing.road) || !commitCrossing(crossing)) {
      lookedAcross = total;
      return false;
    }
    used.add(crossing.road);
    crossedAt = total;
    lookedAcross = -Infinity;
    return true;
  };

  while (total < targetLength) {
    if (++iterations > maxIterations) return null;
    let placed = false;
    // R17 — go and find a road. Asked before the dice, because a borrow is
    // not one more candidate segment: it is a corner onto the tarmac, the
    // run along it and the corner off, solved and validated as one piece
    // (see borrow.ts). Half-placing it would leave the route on a public
    // road it never leaves.
    if (tryBorrow(false)) placed = true;
    // R36 — ...and if there is a road in the way and no borrow took it, go
    // over it. Second, because where the dial is owed tarmac a road in the
    // way is a road worth JOINING: crossing one the stage could have
    // borrowed spends a public road on four seconds of jump and leaves the
    // dial to find another.
    if (!placed && tryCrossing(false)) placed = true;
    // R41 — and the railway, which there is only one way past.
    if (!placed && tryCrossing(false, "rail")) placed = true;
    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      // R9 — near the boundary, steer back toward the middle: force a turn
      // whose direction reduces the outward heading.
      const margin =
        spec.worldBound - Math.max(R.boundMargin.min, spec.worldBound * R.boundMargin.frac);
      const out = Math.abs(cursor.x) > margin || Math.abs(cursor.z) > margin;
      let forcedDir: 1 | -1 | 0 = 0;
      let kind: "straight" | "turn" = rng.chance(R.turnChance) ? "turn" : "straight";
      // R38 — the road the route has already covered without a corner in
      // it. What is left of the cap is what a straight drawn here may be,
      // and where there is not enough left for the shortest one in the
      // vocabulary the next segment has to be a corner. This is the whole
      // rule: it binds the RUN, so a straight that follows a straight is
      // measured against what its neighbour already spent.
      const straightLeft = R.straightRun.max - straightRunAt(plans);
      if (straightLeft < R.straightShort.min) kind = "turn";
      if (out) {
        kind = "turn";
        // Heading error toward the origin decides the turn direction.
        const toCenter = Math.atan2(-cursor.x, -cursor.z);
        let err = toCenter - cursor.heading;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err <= -Math.PI) err += 2 * Math.PI;
        forcedDir = err >= 0 ? 1 : -1;
      }

      const prevWasStraight = plans[plans.length - 1].kind === "straight";
      let plan: SegmentPlan;
      if (kind === "turn") {
        // R1 — the FIRST corner is capped: a grid the depth of the apron is
        // still stacked when the front row reaches it.
        const first = plans.length === 1;
        plan = drawTurn(
          rng,
          prevWasStraight,
          forcedDir,
          sameDirRun,
          first ? R.launch.firstTurn : undefined,
        );
      } else {
        // R38 — drawn from the vocabulary, then trimmed to what the run has
        // left. Trimmed rather than re-drawn: the bucket the dice picked is
        // what says whether this is a breather or a top-gear straight, and
        // a stage that only ever draws short ones after a bend is a stage
        // with no long straights in it at all.
        const length = Math.min(straightLength(rng), straightLeft);
        plan = {
          kind: "straight",
          length,
          ...assignFeature(rng, length, total, sLastLipEnd, knobs),
        };
      }

      // R11 — the segment that crosses targetLength must not overshoot the
      // band's ceiling once the closing straight lands on top.
      if (total + plan.length > spec.band.max - R.closingStraight) continue;

      const { points, end, walked } = probe(cursor, plan);
      if (!points.every((p) => inBounds(p, spec.worldBound))) continue;
      if (
        points.some(
          (p) =>
            field.blocked(p) ||
            entersStart(p, clear) ||
            !keepsDry(p) ||
            !sitsOnTheLand(p) ||
            !clearOfTarmac(p),
        ) ||
        !crossingSits(cursor, plan, points) ||
        !jumpLands(cursor, plan, points)
      ) {
        continue;
      }
      commit(plan, points, end, walked);
      placed = true;
    }
    // R17/R36 — boxed in against a public road, the way through IS the
    // road: over it, or onto it. Tried before the retreat, because backing
    // out of the pocket only works if the pocket has another way out of it,
    // and a stage hemmed between the tarmac and its own line does not.
    //
    // The crossing first here, the other way round from above. Up there the
    // question was what to do with a road the stage has a use for; down here
    // the stage is stuck, and a crossing is the cheaper move by every
    // measure — a hundred metres of straight against a kilometre of detour,
    // and it spends none of the `asphalt` dial on a stage that never asked
    // for tarmac.
    if (!placed && tryCrossing(true)) placed = true;
    if (!placed && tryCrossing(true, "rail")) placed = true;
    if (!placed && tryBorrow(true)) placed = true;
    if (!placed) {
      // Search is stuck (boxed in by its own line). End the stage early if a
      // legal stage length is already reached; otherwise back the line out
      // of the pocket — several segments at once, because a one-segment
      // retreat usually re-enters the same dead end — and let the loop try
      // a different continuation.
      if (total >= spec.band.min - R.closingStraight) break;
      for (let drop = 0; drop < 3; drop++) {
        if (plans.length <= 1) return null;
        uncommit();
      }
      recomputeSameDirRun(plans, sameDirRun);
    }
  }

  // R2 — closing straight (featureless: the finish must be readable), with
  // R23's run-out on the end of it: one straight, walked as one piece,
  // carrying the finish line `runOut` meters short of its end. The two are
  // validated together because they ARE together — a run-out that left the
  // world or ran back across the stage would be exactly the dead end the
  // rule exists to remove.
  //
  // It is validated like any other segment: a finish that would cross the
  // stage (R10) or leave the world (R9) sheds tail segments until it fits,
  // and a stage that cannot fit a legal finish above the minimum length is
  // rejected so the caller retries with a sub-seed.
  //
  // R25's RUN-OUT rides on the end of it: the closing straight and the road
  // past the gate are one piece of straight, walked and validated as one,
  // because a run-out that left the world or ran back across the stage
  // would be exactly the dead end the rule exists to remove.
  //
  // And R24's run-off apron rides on the end of THAT: drawn road with a
  // terrain shelf under it, so a stage that closes across its own line
  // leaves that road hanging in the air just as surely as one that closes
  // across the line itself.
  const closing: SegmentPlan = {
    kind: "straight",
    length: R.closingStraight + R.runOut,
    feature: "none",
    runOut: R.runOut,
  };
  const runOff: SegmentPlan = { kind: "straight", length: R.startZone.apron, feature: "none" };
  for (;;) {
    const { points, end, walked } = probe(cursor, closing);
    // The run-off is checked for clearance but not for BOUNDS: the world
    // bound is the box the search folds the line inside, not a wall, and a
    // finish placed legally near it may run its apron over the edge.
    const past = probe(end, runOff).points;
    const clearOfEverything = (p: Cursor): boolean =>
      !field.blocked(p) &&
      !entersStart(p, clear) &&
      keepsDry(p) &&
      sitsOnTheLand(p) &&
      clearOfTarmac(p);
    // R38 — the closing straight lands on whatever the search stopped on,
    // so a stage that finished its last corner and then drew a straight
    // arrives at the line with two of them end to end. R2 will not have the
    // finish preceded by a corner and R38 will not have the run, so the one
    // thing left to give is the segment underneath: shed the tail until the
    // road into the line is the closing straight and nothing else.
    //
    // Measured on the RACED part only, like R11: the run-out past the gate
    // is road the clock never sees and is deliberately straight.
    const runIn = straightRunAt(plans) + R.closingStraight <= R.straightRun.max;
    if (
      runIn &&
      points.every((p) => inBounds(p, spec.worldBound)) &&
      points.every(clearOfEverything) &&
      past.every(clearOfEverything)
    ) {
      commit(closing, points, end, walked);
      // R11 measures the RACED stage — the road up to the line. The
      // run-out is road the clock never sees.
      return total - R.runOut >= spec.band.min ? plans : null;
    }
    if (plans.length <= 1) return null;
    uncommit();
    recomputeSameDirRun(plans, sameDirRun);
    if (total < spec.band.min - R.closingStraight) return null;
  }
}
