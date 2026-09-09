// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17/R36/R41 — WHERE THE STAGE MEETS THE NETWORK, and what that costs the
// road. Two different events, and the difference is the whole module: a
// JUNCTION is a corner the route turns at, where its carriageway and the
// public road's are one road for a moment and the arm nobody takes is left
// behind with a barrier across it; a CROSSING is a straight going square
// over one, which costs no corner and no detour.
//
// Both are NOTED as the walk passes, because only the walk knows the line
// went there. What they leave behind is the mouth — the flare, the throat
// and the slew that make a junction read as one road meeting another
// rather than two ribbons intersecting — and that is here too.

import type { SegmentPlan } from "./rules.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { straightness } from "./rolling.ts";
import { junctionMainEdge, ROAD_CROSS } from "./road.ts";
import { buildSpur } from "./spur-build.ts";
import { SPUR } from "./spurs.ts";
import { drawSchedule, type RailCrossing } from "./railway.ts";
import type { Cursor } from "./compile-road.ts";
import { armsKeepHeight, branchClearance } from "./compile-road.ts";
import { type Country } from "./compile-country.ts";
import { isLoose } from "./track-shape.ts";
import type { RoadJunction, Track, TrackSample } from "./track-shape.ts";

import type { Walk } from "./compile-walk.ts";

export function createJunctionNoting(
  track: Track,
  walk: Walk,
  rolling: (s: number) => number,
  country: Country | undefined,
) {
  const { land } = walk;
  const { junctions, railMeets } = walk;
  const { trialArms, trialBench } = walk;
  const armCanLeave = (
    pose: { x: number; z: number; heading: number; elevation: number; slope: number },
    atS: number,
    end: "entry" | "exit",
  ): boolean => {
    if (!country) return true;
    const stage = country.roadDistance(pose);
    const others = branchClearance(trialArms);
    const trial = buildSpur(
      track.seed,
      pose,
      atS,
      end,
      country.bounds,
      land,
      track.width,
      (x: number, z: number, ignoringJunction?: boolean) =>
        Math.min(stage(x, z, ignoringJunction), others(x, z)),
      country.shelfHolds,
      country.shelfBand,
    );
    const last = trial.samples[trial.samples.length - 1];
    if (!last) return false;
    const b = country.bounds;
    const out = Math.max(b.minX - last.x, last.x - b.maxX, b.minZ - last.z, last.z - b.maxZ);
    if (out < R.junction.armReach * SPUR.escape) return false;
    if (!armsKeepHeight(trial, trialArms, trialBench)) return false;
    // A true answer here is always taken — the caller flips the surface on
    // it — so this arm is part of the country the next trial is measured
    // against.
    trialArms.push(trial);
    return true;
  };

  /** R17 — is this corner one a junction could sit at? A junction is where
   * a road MEETS another; that needs a real turn, neither a kink nor a
   * hairpin, and one tight enough that the two carriageways actually PART
   * rather than peel away from each other over fifty meters of tangent —
   * and an abandoned arm with somewhere to go. */
  const isJunctionTurn = (plan: SegmentPlan, at: Cursor, joining: boolean): boolean => {
    if (plan.kind !== "turn" || !plan.radius || plan.feature !== "none") return false;
    const angle = plan.length / plan.radius;
    if (angle < R.paving.junctionAngle.min || angle > R.paving.junctionAngle.max) return false;
    if (plan.radius < R.paving.junctionRadius * track.width) return false;
    if (partedAt(plan.radius) > R.paving.junctionParts * track.width) return false;
    // Where the route JOINS the tarmac the meeting point is the corner's
    // far end, so the arm leaves from where the cursor will be once the
    // corner is walked — projected here, since the decision is made before
    // it is. The arc's centre is a road's width to the inside of the
    // tangent; the far tangent point is the same distance back from it.
    const dir = plan.dir ?? 1;
    const radius = plan.radius;
    const exit = joining ? at.heading + dir * angle : at.heading;
    const cx = at.x + Math.cos(at.heading) * radius * dir;
    const cz = at.z - Math.sin(at.heading) * radius * dir;
    const x = joining ? cx - Math.cos(exit) * radius * dir : at.x;
    const z = joining ? cz + Math.sin(exit) * radius * dir : at.z;
    const rollS = at.rollS + (joining ? plan.length * straightness(dir / radius) : 0);
    // R34 — the height the road is at, not the height its roll is at: the
    // base the builder's eye has followed the country to, carried forward
    // on its current grade where the corner has yet to be walked. A trial
    // branch started tens of metres under the road it leaves is one the
    // shelf refuses for a reason that has nothing to do with the junction.
    const base = at.baseY + (joining ? at.baseSlope * plan.length : 0);
    const slope = at.baseSlope + (rolling(rollS + 2) - rolling(rollS - 2)) / 4;
    return armCanLeave(
      {
        x,
        z,
        heading: (joining ? exit + Math.PI : at.heading) % (Math.PI * 2),
        elevation: base + rolling(rollS),
        slope: joining ? -slope : slope,
      },
      at.s + (joining ? plan.length : 0),
      joining ? "entry" : "exit",
    );
  };

  /** How far along the main road the two carriageways still overlap: the
   * arc the corner has to run before it has carried the route clear of the
   * main road's mat. It is the length of the junction, and it is what says
   * whether a corner is one at all. */
  const partedAt = (radius: number): number => {
    const cos = Math.max(-1, Math.min(1, 1 - track.width / radius));
    return radius * Math.acos(cos);
  };

  /** ...and the platform built over it, clamped so a junction stays a
   * junction and not a car park. */
  const platformReach = (radius: number): number =>
    Math.max(
      R.junction.reach.min,
      Math.min(R.junction.reach.max, partedAt(radius) * R.junction.platform),
    );

  /** How far into the corner the route's own centerline is still on the
   * MAIN road's mat — which is where the surface changes, because that is
   * where the car actually leaves the tarmac. */
  const onMainRun = (radius: number): number => {
    const half = track.width / 2;
    const cos = Math.max(-1, Math.min(1, 1 - half / radius));
    return radius * Math.acos(cos);
  };

  /** Note the junction a surface change happens at. The route arrives on
   * one road and turns onto the other; the arm it does NOT take carries
   * straight on through the crossing, and that is what the branch is: the
   * MAIN road's own line, continued. The meeting point is the corner's
   * tangent point — the START of the turn where the route leaves the
   * sealed road, its END where the route joins one — so the junction sits
   * ON the road rather than out at the intersection of two tangents, which
   * on a sweeping corner is a hundred meters away in a field. */
  const noteJunction = (plan: SegmentPlan, at: Cursor, joining: boolean): void => {
    const radius = plan.radius ?? 1;
    const dir = plan.dir ?? 1;
    // The main road's line: the tangent the route shares with the branch.
    // Joining, that is the tangent at the END of the corner and it points
    // BACK the way the tarmac came; leaving, the tangent at its start.
    const heading = joining ? at.heading + Math.PI : at.heading;
    // R34 — the country the road is following here, plus its roll. The
    // branch and its platform are built on the SAME height the route is at,
    // so a junction is one plane whatever the ground under it was doing.
    const y = at.baseY + rolling(at.rollS);
    const slope = at.baseSlope + (rolling(at.rollS + 2) - rolling(at.rollS - 2)) / 4;
    // The minor road leaves the meeting point on that same tangent and
    // curves away. Traced from the junction OUTWARD, a corner the route
    // drove backwards through bends the other way.
    const curve = (joining ? -dir : dir) / radius;
    const reach = platformReach(radius);
    junctions.push({
      x: at.x,
      z: at.z,
      elevation: y,
      slope: joining ? -slope : slope,
      heading,
      joining,
      s: at.s,
    });
    track.junctions.push({
      x: at.x,
      z: at.z,
      y,
      // The platform lies on the MAIN road's grade, so both carriageways
      // and the ground between them are one plane.
      grade: {
        x: Math.sin(heading) * slope * (joining ? -1 : 1),
        z: Math.cos(heading) * slope * (joining ? -1 : 1),
      },
      heading,
      curve,
      width: track.width,
      reach,
      spread: track.width * 0.85,
      s: at.s,
      joining,
    });
  };

  /** R36 — note the CROSSING a `overRoad` straight makes. Everything about
   * it is stated the other way round from a junction, and each difference is
   * the same difference: nobody turns.
   *
   * - The meeting point is the middle of the passage, not a corner's tangent
   *   point, so it is found by asking which point of the WALKED road is
   *   nearest the piece of tarmac the search aimed at. The search's 6 m
   *   probe and this 2 m walk diverge by a metre or two over a stage, and a
   *   crossing placed at the search's answer is a crossing a metre off the
   *   road it crosses — which is a platform with a strip of unlevelled
   *   ground down one edge of it.
   * - The platform is LEVEL and it stands `crossing.stand` above the route's
   *   own line. That is the whole feature (R36): the public road is built up
   *   on a formation, the rally is scraped along the field, and the car goes
   *   over the step. A junction takes the main road's grade because the
   *   route is about to drive down it; nothing drives down this one.
   * - It is elongated ACROSS the tarmac (`spread` is the ramp, `reach` the
   *   footprint on the public road) and it is SYMMETRIC (`behind: 1`),
   *   because the gravel opens on both sides of it.
   * - And `curve` is zero: the minor road is one straight line through the
   *   middle, which is what makes the two dirt arms opposite each other. */
  const noteCrossing = (
    over: NonNullable<SegmentPlan["overRoad"]>,
    path: { x: number; z: number; heading: number; s: number; base: number; slope: number }[],
    rollAt: (u: number) => number,
    step: number,
  ): void => {
    const road = track.highways[over.road];
    if (!road) return;
    const on = road.points[over.index];
    if (!on) return;
    let best = 0;
    let nearest = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = Math.hypot(path[i].x - on.x, path[i].z - on.z);
      if (d >= nearest) continue;
      nearest = d;
      best = i;
    }
    const at = path[best];
    // R36 — the step. The route's OWN height here plus the stand: the
    // formation the public road is built on, which the gravel has to climb.
    const y = at.base + rollAt((best + 1) * step) + R.crossing.stand;

    // ...and the plane that formation lies on. LEVEL ALONG THE PUBLIC ROAD,
    // which is the direction anybody looks down it, and tilted at the
    // ROUTE's own grade across it.
    //
    // Both halves of that are load-bearing and the second one was learned
    // the hard way. A dead level platform is what a formation actually is,
    // and on flat country it is right — but the moment the rally crosses on
    // a slope the two edges of it are at two different heights above the
    // route's own line, and where the country falls faster than `stand` the
    // far edge is BELOW it. That is not a jump, it is a hole with a road in
    // it: measured over seeds 1-24 the level plane gave steps of 2.0 to 2.9
    // m and ramps at 27-33%, none of it the number `stand` says. Tilted at
    // the route's grade the step is exactly `stand` on both sides of every
    // crossing on every seed, which is what makes this a feature that can be
    // tuned rather than a lottery the country runs.
    //
    // What it costs is cross-fall on the sealed mat — the route's grade over
    // `reach`, so a few per cent over a road width. A public road laid
    // across a hillside does that.
    //
    // The grade is the road's WHOLE slope, not the country's: the base the
    // builder's eye has followed the land to, plus the rate its own roll
    // (R34) is climbing at. Reading only the base left the roll to diverge
    // across the ramp — a wave a metre deep over twenty is another five per
    // cent on top of a thirteen, and it is the difference between the seeds
    // that measured 13% and the ones that measured 25%.
    const u = (best + 1) * step;
    const slope = at.slope + (rollAt(u + 2) - rollAt(u - 2)) / 4;
    const grade = {
      x: Math.sin(at.heading) * slope,
      z: Math.cos(at.heading) * slope,
    };
    junctions.push({
      x: at.x,
      z: at.z,
      elevation: y,
      slope: 0,
      heading: on.heading,
      joining: false,
      s: at.s,
      crossing: true,
      road: { road, index: over.index },
    });
    track.junctions.push({
      x: at.x,
      z: at.z,
      y,
      grade,
      heading: on.heading,
      curve: 0,
      width: track.width,
      reach: R.crossing.reach * track.width,
      // The graded area is a JUNCTION's, not the ramp's: this is the paving
      // and the levelling, and a crossing's footprint on the ground is the
      // same size as any other place two roads meet. The ramps are longer
      // and they are not this (see `crossing.ramp`).
      spread: track.width * 0.85,
      behind: 1,
      drag: R.crossing.drag,
      s: at.s,
      joining: false,
      crossing: true,
    });
  };

  /** R41 — note the RAILWAY CROSSING an `overRoad` straight makes where the
   * line it goes over is a railway. Nothing here is a platform: the rails
   * are laid flush with the road at its own grade, the ramp is the
   * straight's own jump feature (already in the samples' elevation, the way
   * any lip is), and what has to be recorded is the PLACE — for the arms
   * to be cut from, for the train to be timed against, and for the
   * renderer to lay the crossing deck and stand the signs at. */
  const noteRailCrossing = (
    over: NonNullable<SegmentPlan["overRoad"]>,
    path: { x: number; z: number; heading: number; s: number; base: number; slope: number }[],
    rollAt: (u: number) => number,
    step: number,
    lipS: number,
  ): void => {
    const road = track.highways[over.road];
    if (!road) return;
    const on = road.points[over.index];
    if (!on) return;
    // The crossing is where the route meets the LINE, not the rail point
    // it passes nearest: the rails are sampled at the highway's own
    // spacing, and a route crossing square between two of its points is
    // nearest to one of them metres before or after it actually crosses —
    // which records the crossing that far off the lip's own `gap`, and a
    // lip two metres short of the rails is a car landing on them. So the
    // distance is to the line's two segments either side of the point.
    const prev = road.points[over.index - 1] ?? on;
    const next = road.points[over.index + 1] ?? on;
    const toSegment = (
      p: { x: number; z: number },
      a: { x: number; z: number },
      b: { x: number; z: number },
    ): number => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t =
        len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
      return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
    };
    let best = 0;
    let nearest = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = Math.min(toSegment(path[i], prev, on), toSegment(path[i], on, next));
      if (d >= nearest) continue;
      nearest = d;
      best = i;
    }
    const at = path[best];
    const y = at.base + rollAt((best + 1) * step);
    const crossing: RailCrossing = {
      x: at.x,
      z: at.z,
      y,
      heading: on.heading,
      s: at.s,
      road: over.road,
      index: over.index,
      lipS,
      schedule: drawSchedule(track.seed, track.rails.length, at.s),
      line: { samples: [], length: 0, crossingS: 0, cells: new Map() },
    };
    track.rails.push(crossing);
    railMeets.push({ crossing, road, slope: at.slope });
  };

  /** R36 — is this point ON the public road's mat at a crossing?
   *
   * For the road width it spends up there the rally is not on a rally road:
   * it is on the tarmac, briefly, the way anybody crossing a main road is.
   * So that stretch is SEALED — which sets the grip under the wheels, takes
   * R33's grain and width wander out of it (a paving machine lays one
   * width), and hands the renderer a surface that agrees with the mat it
   * paints across the crossing from the same edge function.
   *
   * The seam is the main road's own EDGE, cut square, exactly as it is at a
   * junction. It is the one place a stage changes surface without a
   * junction and without R20's run-out, and it needs no ceremony because
   * nothing about it is a decision: the car is on the tarmac because the
   * tarmac is there. */
  const onCrossingSeal = (x: number, z: number): boolean => {
    for (const junction of track.junctions) {
      if (!junction.crossing) continue;
      const past = junctionMainEdge(junction, x, z);
      if (past !== null && past <= 0) return true;
    }
    return false;
  };

  /** R36 — how much of the CROSSING's own plane a sample of the rally road
   * takes at this arc position, 1 up on the formation to 0 back down on the
   * country. The ramp: the road climbs onto the public road's formation and
   * drops off the far side, and the drop is the jump.
   *
   * Measured along the route's ARC and not across the ground, because that
   * is the direction the rally climbs and the only one the ramp has. The
   * platform's ellipse is the other measurement and it stays what it is —
   * a shape on the ground, describing the graded area. This holds the plane
   * for as far as that ellipse does (`0.72 * spread`, where its own falloff
   * begins) so the two hand over with no seam, then eases off over
   * `crossing.ramp` metres of gravel.
   *
   * A smoothstep, so the road leaves the formation and rejoins the country
   * with no kink at either end — a linear ramp puts a crease at the toe that
   * reads as a step in the road and measures as one. */
  const crossingRamp = (junction: RoadJunction, s: number): number => {
    if (!junction.crossing) return 0;
    const hold = 0.72 * junction.spread;
    const d = Math.abs(s - junction.s);
    if (d <= hold) return 1;
    const t = (d - hold) / R.crossing.ramp;
    if (t >= 1) return 0;
    return 1 - t * t * (3 - 2 * t);
  };

  /** R17 — how far back down the MINOR road a mouth may reach, m. A
   * proportion of the road's own width: the mouth of a lane and the mouth
   * of a boulevard are the same place at two scales. */
  const mouthRun = R.junction.mouth.run * track.width;

  /** R17 — the fastest a mouth may open, m of mat per m of road. What sets
   * it is the GROUND: the terrain shapes its shelf around the nearest
   * centerline point, so a mat that widens faster than the samples are
   * spaced leaves a probe at a wide sample's lip nearest to a narrow one
   * alongside, the ground hands over inside the ribbon, and the seam is a
   * face down the outside of the mouth. Measured on the rollers' seam
   * check: past this the step at the mouth's rim goes over what a wheel
   * rides. */
  const MOUTH_SLEW = 0.42;

  /** R17 — the MOUTH's two sizes, m: how much wider the mat is where it
   * meets the tarmac, and the length of lane it opens over.
   *
   * The widening is CAPPED at the corridor's own reach (R16), and that cap
   * is the thing standing between this mouth and the one a real junction
   * has. The ground lattice is shaped out to the corridor's lip and hands
   * over to the country past it, so a mat that flares further is a mat over
   * ground nothing shelved — a vertical face along the outside of the
   * mouth. Enlarging the PLATFORM to cover a wider mouth does not buy it
   * either: measured on seed 1, spreading the graded ellipse by the mouth's
   * own width left the seam where it was (0.46 m) and opened a 1.5 m gap
   * between the ribbon and the tiles, because the ground under the road
   * moved with it. What a wider mouth needs first is a corridor that owns a
   * point by which MAT is nearest rather than by which centerline is. */
  const mouthWide = Math.min(R.junction.mouth.wide * track.width, ROAD_CROSS.reach);
  const mouthTaper = R.junction.mouth.taper * track.width;

  /** R17 — where each junction's THROAT is: how far back down the minor
   * road, in meters of its own arc, the centerline crosses the main road's
   * edge. That crossing is the mouth's mouth — the line the dirt road stops
   * at and the tarmac starts — and the fillet is measured back from it.
   *
   * Measured off the built road rather than from the corner's nominal
   * radius, and remembered per junction because the flare asks for it once
   * per sample. */
  const throatOf = (junction: RoadJunction): number => {
    const nx = Math.cos(junction.heading);
    const nz = -Math.sin(junction.heading);
    // The NEAREST crossing to the meeting point, not the first one the walk
    // meets: a joining junction's minor arm runs backwards through the
    // sample list, so the first sample in `s` order that stands off the mat
    // is the far end of the mouth rather than its throat.
    let throat = Infinity;
    for (const sample of track.samples) {
      const d = junction.joining ? junction.s - sample.s : sample.s - junction.s;
      if (d < 0 || d > mouthRun || d >= throat) continue;
      const across = (sample.x - junction.x) * nx + (sample.z - junction.z) * nz;
      if (Math.abs(across) >= junction.width / 2) throat = d;
    }
    // Infinity where the minor arm never leaves the main road's mat inside
    // the window: there is no throat, so there is no mouth. Falling back to
    // zero instead opens one at the meeting point itself — on the SEALED
    // side, where the road is laid to a constant width (R33) and the flare
    // is three times the road across a piece of tarmac.
    return throat;
  };
  const throats = new Map<RoadJunction, number>();

  /** R17 — how much wider the MOUTH makes a sample of the minor road, m of
   * extra half-width per side.
   *
   * A quarter ellipse: `mouthWide` of extra half-width at the THROAT,
   * closing to nothing over `mouthTaper` of lane. It leaves the road's own
   * edge with no kink and arrives at the tarmac at its widest, which is
   * where a car turning out of the lane needs the room — the whole reason
   * a mouth is wider than the road behind it.
   *
   * `out` is meters of the minor road's OWN length back from the throat,
   * not distance across the main road: a mouth is a length of lane, so it
   * reaches the same way back down it whether the lane arrives square or at
   * a slant. Measured across instead, an oblique junction gets its whole
   * mouth compressed into the few meters its centerline takes to cross the
   * edge, and opens like a trapdoor.
   *
   * At the throat it is over. A sample past it is standing on the through
   * road, which is already paved right across — carrying the flare on
   * puts a mushroom of dirt into the field on the far side of a road that
   * never needed covering.
   *
   * Returns 0 for a sample that is not the minor road of any junction. The
   * minor arm is the unsealed one, so which side of the meeting point it
   * lies on follows from `joining` alone: the stage ARRIVES at a joining
   * junction on the dirt and LEAVES a parting one on it. */
  /** R17 — which side each junction's mouth opens on, in the ROUTE's own
   * lateral frame: the outside of the corner the route turns through, read
   * off the sample at the meeting point and then held for the whole mouth.
   *
   * Read per sample instead, it flips halfway: a junction's corner unwinds
   * over the last few metres, its curvature crosses zero, and the mat's
   * wide side jumps from one edge to the other inside one mouth. Which side
   * is the outside is a fact about the JUNCTION, so it is decided once. */
  const mouthSides = new Map<RoadJunction, 1 | -1>();
  const outerOf = (junction: RoadJunction): 1 | -1 => {
    let side = mouthSides.get(junction);
    if (side !== undefined) return side;
    let best = Infinity;
    let curvature = 0;
    for (const sample of track.samples) {
      const d = Math.abs(sample.s - junction.s);
      if (d >= best) continue;
      best = d;
      curvature = sample.curvature;
    }
    side = curvature >= 0 ? -1 : 1;
    mouthSides.set(junction, side);
    return side;
  };

  const mouthFlare = (sample: TrackSample): { extra: number; outer: 1 | -1 } => {
    // The mouth belongs to the DIRT road. Said here rather than left to the
    // throat arithmetic, because the surface flip and the throat are two
    // measurements of the same crossing taken different ways, and a sample
    // between the two answers would otherwise get the full mouth laid on a
    // piece of tarmac — which a paving machine does not do (R33).
    if (!isLoose(sample.surface)) return { extra: 0, outer: 1 };
    let widest = 0;
    let outer: 1 | -1 = 1;
    for (const junction of track.junctions) {
      // R36 — A CROSSING HAS NO MOUTH, and that is what squareness buys.
      // A mouth exists because a junction is a CORNER: the dirt road meets
      // the tarmac at an angle, which leaves a wedge of country tapering to
      // a knife point between the two mats, and the flare is what traffic
      // wears away to close it. Crossed at right angles there is no wedge —
      // a rectangle meeting a rectangle square meets it along a straight
      // edge — so a flare here would be a lane that briefly got fatter for
      // no reason, and a lopsided one at that (`outerOf` reads the corner's
      // curvature, and a crossing has none).
      if (junction.crossing) continue;
      const d = junction.joining ? junction.s - sample.s : sample.s - junction.s;
      if (d < 0 || d > mouthRun) continue;
      let throat = throats.get(junction);
      if (throat === undefined) throats.set(junction, (throat = throatOf(junction)));
      const out = d - throat;
      if (out >= mouthTaper) continue;
      // Past the throat the mouth is at its WIDEST and stays there. The
      // surface flip and the throat are two measurements of the same
      // crossing taken different ways, so a sample can be gravel and
      // already inside the sealed road's edge — and dropping the flare
      // there took the mouth from twenty-nine metres to sixteen in one
      // two-metre step, at exactly the place the two roads have to meet.
      // What that leaves is a wedge of field between the dirt road's edge
      // and the tarmac's, which is the whole defect the mouth exists to
      // close. The `surface` guard above is what keeps this off the main
      // road: the tarmac's own samples never take a flare (R33).
      const t = out <= 0 ? 1 : 1 - out / mouthTaper;
      const extra = mouthWide * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      if (extra > widest) {
        widest = extra;
        outer = outerOf(junction);
      }
    }
    return { extra: widest, outer };
  };

  return {
    armCanLeave,
    isJunctionTurn,
    partedAt,
    platformReach,
    onMainRun,
    noteJunction,
    noteCrossing,
    noteRailCrossing,
    onCrossingSeal,
    crossingRamp,
    mouthRun,
    mouthWide,
    mouthTaper,
    throatOf,
    throats,
    mouthSides,
    outerOf,
    mouthFlare,
    MOUTH_SLEW,
  };
}
