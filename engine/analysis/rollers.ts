// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLLERS — a rank of balls the size of a wheel, rolled down the stage
// side by side, each one writing down the surface it touches and anything
// it hits on the way.
//
// The idea is older than any of this: you find out whether a road is a road
// by putting something round on it. A rule check can only ask whether the
// plan was legal; a roller asks what the ground actually DOES under a
// wheel, which is the only question the car ever asks. The rank runs from
// the far verge on one side to the far verge on the other, because a rally
// car spends half a stage off the mat and R31 promises the ground beside
// the road is rideable — so the verge is analyzed exactly like the road,
// at a looser tolerance.
//
// Three things come out of the field of contact points, and each is a
// different kind of wrong:
//
//   ALONG a lane — the grade. A stride that climbs or drops harder than a
//   road does is a step, not a slope: the ford ramp that got too steep, the
//   shelf that failed to blend, the hillside the verge cone did not cut.
//
//   ACROSS the rank — the residual. The camber, the wheel tracks and the
//   bank are all KNOWN (road.ts draws them), so they are subtracted, and
//   what is left between two adjacent balls is a wall or a trench that
//   nothing put there on purpose.
//
//   The BALL BRIDGES. A defect narrower than the contact patch is one the
//   wheel rolls straight over and the driver never feels, so it is reported
//   as a note and scored as nothing. This is the whole reason the probe is
//   a ball and not a point: without it, every analytic field's own noise
//   reads as a road full of holes.

import { corridorOffset, ROAD_CROSS } from "../mapgen/road.ts";
import type { Track, TrackSample } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, type Check, type Finding, type MetricReport } from "./types.ts";

/** One ball's contact at one stride. */
type Contact = {
  s: number;
  /** Which track sample the stride was taken at. Carried rather than
   * recovered from `s`: sample spacing is only approximately `track.step`,
   * so dividing back lands several samples out by the end of a long stage
   * — and a ford is only a few samples wide. */
  index: number;
  x: number;
  z: number;
  /** Surface height the ball rests on, m. */
  y: number;
  /** What the road's own cross-section says should be there, m — null off
   * the ribbon, where there is no road shape to compare against. */
  want: number | null;
};

/** Where the rank's lanes sit, in signed meters from the centerline. */
function laneOffsets(half: number): number[] {
  const reach = half + ANALYSIS.rollers.verge;
  const spacing = ANALYSIS.rollers.spacing;
  const perSide = Math.ceil(reach / spacing);
  const lanes: number[] = [];
  for (let i = -perSide; i <= perSide; i++) lanes.push(i * spacing);
  return lanes;
}

/** True where a lane is on the DRIVEN ribbon — the mat and the shoulder
 * the road mesh draws — rather than out on the landscape. The tolerances
 * either side of this line are different by a factor of three, because so
 * are the two surfaces' jobs. */
function onRibbon(lateral: number, half: number): boolean {
  return Math.abs(lateral) <= half + ROAD_CROSS.reach;
}

/** Strides where the surface is a FEATURE rather than a road: the jump lip
 * itself and the ground it throws the car over. R6 owns whether a jump is
 * placed legally; the roller has nothing useful to say about a drop that
 * is the entire point. */
function jumpMask(track: Track): boolean[] {
  const mask = new Array<boolean>(track.samples.length).fill(false);
  const span = Math.ceil(ANALYSIS.rollers.jumpSkip / track.step);
  for (let i = 0; i < track.samples.length; i++) {
    if (!track.samples[i].jump) continue;
    for (let k = Math.max(0, i - 2); k <= Math.min(mask.length - 1, i + span); k++) {
      mask[k] = true;
    }
  }
  return mask;
}

/** Roll the rank down the stage and score what it finds. */
export function analyzeRollers(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const half = track.width / 2;
  const lanes = laneOffsets(half);
  const stride = Math.max(1, ANALYSIS.sampling.stride);
  const skip = jumpMask(track);

  // The rank's whole field of contacts: lane-major, so a lane's profile is
  // contiguous and the along-lane walk reads it in order.
  const rank: Contact[][] = lanes.map(() => []);
  for (let i = 0; i < track.samples.length; i += stride) {
    if (skip[i]) continue;
    const sample: TrackSample = track.samples[i];
    const rx = Math.cos(sample.heading);
    const rz = -Math.sin(sample.heading);
    for (let k = 0; k < lanes.length; k++) {
      const lateral = lanes[k];
      const x = sample.x + rx * lateral;
      const z = sample.z + rz * lateral;
      rank[k].push({
        s: sample.s,
        index: i,
        x,
        z,
        y: terrain.groundAt(x, z),
        want: onRibbon(lateral, half)
          ? sample.elevation + corridorOffset(sample, lateral, track.width)
          : null,
      });
    }
  }

  const probes = rank.reduce((sum, lane) => sum + lane.length, 0);

  // ── ALONG each lane: grade, and the bumps a grade check cannot see ────
  let steps = 0;
  let breaks = 0;
  let bumps = 0;
  let worstGrade = 0;
  let worstBump = 0;
  let strides = 0;
  for (let k = 0; k < lanes.length; k++) {
    const mat = onRibbon(lanes[k], half);
    const limit = mat ? ANALYSIS.rollers.grade.mat : ANALYSIS.rollers.grade.verge;
    const broken = mat ? ANALYSIS.rollers.gradeFail.mat : ANALYSIS.rollers.gradeFail.verge;
    const bumpLimit = mat ? ANALYSIS.rollers.bump.mat : ANALYSIS.rollers.bump.verge;
    const lane = rank[k];
    for (let i = 1; i < lane.length; i++) {
      const run = Math.abs(lane[i].s - lane[i - 1].s);
      if (run < 1e-3) continue;
      strides++;
      const grade = Math.abs(lane[i].y - lane[i - 1].y) / run;
      if (grade > limit) {
        steps++;
        if (grade > broken) breaks++;
        if (grade > worstGrade) {
          worstGrade = grade;
          findings.push({
            code: "rollers.grade",
            severity: grade > broken ? "error" : "warn",
            message: `a ${(grade * run).toFixed(2)} m step over ${run.toFixed(0)} m ${
              mat ? "on the road" : "on the verge"
            } (${lanes[k].toFixed(1)} m off the centerline)`,
            at: { x: lane[i].x, z: lane[i].z },
            s: lane[i].s,
            value: grade,
          });
        }
      }
      if (i + 1 >= lane.length) continue;
      // A hollow or a pimple: the middle contact off the line its two
      // neighbours draw. Both its slopes can be legal and the wheel still
      // leaves the ground over it.
      const bump = Math.abs(lane[i - 1].y - 2 * lane[i].y + lane[i + 1].y);
      if (bump > bumpLimit) {
        bumps++;
        if (bump > worstBump) {
          worstBump = bump;
          findings.push({
            code: "rollers.bump",
            severity: "warn",
            message: `a ${bump.toFixed(2)} m bump ${mat ? "on the road" : "on the verge"} (${lanes[
              k
            ].toFixed(1)} m off the centerline)`,
            at: { x: lane[i].x, z: lane[i].z },
            s: lane[i].s,
            value: bump,
          });
        }
      }
    }
  }

  // ── ACROSS the rank: what is left when the road's own shape is taken
  // out. Balls whose gap is narrower than a contact patch are bridged, so
  // only a step that survives two lanes counts.
  let walls = 0;
  let pairs = 0;
  let worstCross = 0;
  const diameter = ANALYSIS.rollers.radius * 2;
  const bridged = ANALYSIS.rollers.spacing < diameter;
  for (let k = 1; k < lanes.length; k++) {
    const mat = onRibbon(lanes[k], half) && onRibbon(lanes[k - 1], half);
    // A step is an ERROR only where the car is meant to be — on the mat
    // itself. Out on the shoulder and past it the ribbon is handing over to
    // the ground lattice, and the seam between two surfaces sampled 14 m
    // apart is a place to keep an eye on, not a hole in the road.
    const driven = Math.abs(lanes[k]) <= half && Math.abs(lanes[k - 1]) <= half;
    const limit = mat ? ANALYSIS.rollers.cross.mat : ANALYSIS.rollers.cross.verge;
    const a = rank[k - 1];
    const b = rank[k];
    for (let i = 0; i < a.length && i < b.length; i++) {
      pairs++;
      // Subtract the cross-section the road is SUPPOSED to have there, so
      // the camber, the wheel tracks and the bank all cancel and the
      // residual is only what nobody asked for.
      const modelled =
        a[i].want !== null && b[i].want !== null
          ? (b[i].want as number) - (a[i].want as number)
          : 0;
      const step = Math.abs(b[i].y - a[i].y - modelled);
      if (step <= limit) continue;
      // The ball bridges: a step this narrow is one the wheel rolls over.
      const wide =
        !bridged ||
        (k + 1 < lanes.length && Math.abs(rank[k + 1][i].y - b[i].y) < limit) ||
        (k >= 2 && Math.abs(a[i].y - rank[k - 2][i].y) < limit);
      if (!wide) continue;
      walls++;
      if (step > worstCross) {
        worstCross = step;
        findings.push({
          code: "rollers.cross",
          severity: driven ? "error" : "warn",
          message: `a ${step.toFixed(2)} m step across the rank ${
            driven ? "on the road" : "beside it"
          }, ${lanes[k].toFixed(1)} m off the centerline`,
          at: { x: b[i].x, z: b[i].z },
          s: b[i].s,
          value: step,
        });
      }
    }
  }

  // ── What the rank HITS. On the mat nothing solid may stand at all; a
  // parapet is the one wall on a stage that is there on purpose (R13), so
  // it is not counted against the road it edges.
  let blocked = 0;
  let checkedMat = 0;
  let worstBlock = 0;
  for (let k = 0; k < lanes.length; k++) {
    if (!onRibbon(lanes[k], half)) continue;
    const inMat = Math.abs(lanes[k]) <= half;
    if (!inMat) continue;
    for (const contact of rank[k]) {
      checkedMat++;
      const solids = [
        ...terrain.obstaclesNear(contact.x, contact.z, ANALYSIS.rollers.radius),
        ...terrain.treesNear(contact.x, contact.z, ANALYSIS.rollers.radius),
      ];
      for (const solid of solids) {
        const gap =
          Math.hypot(solid.x - contact.x, solid.z - contact.z) -
          solid.radius -
          ANALYSIS.rollers.radius;
        if (gap >= 0) continue;
        blocked++;
        if (-gap > worstBlock) {
          worstBlock = -gap;
          findings.push({
            code: "rollers.clear",
            severity: "error",
            message: `a ${solid.kind} stands ${(-gap).toFixed(2)} m into the road`,
            at: { x: solid.x, z: solid.z },
            s: contact.s,
            value: -gap,
          });
        }
      }
    }
  }

  // ── ...and what it drives INTO. Standing water over the driving surface
  // is a ford or a drowned road, and only one of those was designed.
  let drowned = 0;
  let worstDepth = 0;
  for (let k = 0; k < lanes.length; k++) {
    if (Math.abs(lanes[k]) > half) continue;
    for (const contact of rank[k]) {
      const water = terrain.waterAt(contact.x, contact.z);
      if (water === null) continue;
      const sample = track.samples[contact.index];
      if (sample.surface === "water" || sample.deck !== null) continue;
      const depth = water - contact.y;
      if (depth <= 0.15) continue;
      drowned++;
      if (depth > worstDepth) {
        worstDepth = depth;
        findings.push({
          code: "rollers.dry",
          severity: "error",
          message: `${depth.toFixed(2)} m of water standing on road that is not a crossing`,
          at: { x: contact.x, z: contact.z },
          s: contact.s,
          value: depth,
        });
      }
    }
  }

  const tolerated = ANALYSIS.rollers.tolerated;
  const checks: Check[] = [
    {
      id: "grade",
      label: "no step the wheel meets as an edge",
      score: rate(steps + breaks * 4, Math.max(1, strides), tolerated),
      weight: 2,
      value: worstGrade,
      budget: ANALYSIS.rollers.grade.mat,
    },
    {
      id: "cross",
      label: "no wall or trench across the corridor",
      score: rate(walls, Math.max(1, pairs), tolerated),
      weight: 2,
      value: worstCross,
      budget: ANALYSIS.rollers.cross.mat,
    },
    {
      id: "bump",
      label: "no hollow the road did not ask for",
      score: rate(bumps, Math.max(1, strides), tolerated),
      weight: 1,
      value: worstBump,
      budget: ANALYSIS.rollers.bump.mat,
    },
    {
      id: "clear",
      label: "nothing solid standing in the road",
      score: rate(blocked, Math.max(1, checkedMat)),
      weight: 2,
      value: worstBlock,
    },
    {
      id: "dry",
      label: "no water on road that is not a crossing",
      score: rate(drowned, Math.max(1, checkedMat)),
      weight: 1.5,
      value: worstDepth,
    },
  ];

  return {
    id: "rollers",
    label: "road surface",
    score: metricScore(checks),
    weight: ANALYSIS.weights.rollers,
    checks,
    findings,
    stats: {
      lanes: lanes.length,
      probes,
      steps,
      breaks,
      bumps,
      walls,
      blocked,
      drowned,
      worstGrade,
      worstCross,
    },
    ms: Date.now() - started,
  };
}
