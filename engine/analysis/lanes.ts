// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OTHER ROADS, DRIVEN — every road that hangs off the stage, rolled
// down the way the rollers roll the stage itself.
//
// The stage is measured to a wheel's width (`rollers.ts`); the roads off
// it were not measured at all, and a road nobody measures is a road that
// rots. An abandoned branch (R17), a homestead's drive (R37) and the lane
// into a car park (R42) are all real road — the terrain shelves them, the
// physics gives them gravel, a player who ignores the tape drives them —
// and every one of them is built by a walk that follows the country at a
// grade, off a road, into a pad or a join. Each of those is a place the
// profile can kink, and the terrain under it is a second surface built
// from the first: the two can disagree by exactly the kind of step this
// finds — a shelf hung off the nearest sample instead of the road between
// samples is a staircase with a tread every four metres, and a lane that
// cannot climb to its join arrives beside the road and drops onto it.
//
// So the questions are the rollers', asked of the roads the rollers never
// visit, plus two of the profile's own:
//
//   THE GROUND IS A RAMP, NOT A STAIR. Along three balls — the middle and
//   the two wheel tracks — at a metre's stride, the ridden ground
//   (`terrain.groundAt`, the exact surface the car stands on) may not step
//   or bump harder than the stage's own mat is allowed to.
//
//   THE PROFILE IS A ROAD'S. As laid, sample to sample, it climbs no harder
//   than a minor road is built to and bends no faster than a minor road's
//   crest rule — because a grade that flips between two samples is a brow
//   the car flies, and the walk that lays these has more than one place it
//   can leave one.
//
//   THE GROUND AGREES WITH THE ROAD. The ridden surface on the centerline
//   is the profile: a ribbon standing off its own shelf, or sunk into it,
//   is a step at every sample.
//
//   THE ROAD REACHES WHAT IT RUNS ONTO. The walk runs a few metres past the
//   end that meets a pad or a yard, so the hand-over there is measured as
//   road, not skipped as somebody else's ground; the end that stands on
//   another road is measured by the join sample itself, which lies on that
//   road's centerline at that road's own height.

import { SPUR, type SpurLine } from "../mapgen/spurs.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import type { Track } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, type Check, type Finding, type MetricReport } from "./types.ts";

/** One road off the stage, with what it is called in a finding, and how
 * far past each end the walk runs. A road that ENDS on a pad or a yard is
 * walked onto it, because the car does and the hand-over is the thing to
 * measure; one that starts on another road's centerline is not walked
 * backwards across that road — the walk would cross its crown square,
 * which no car drives and every 1 m stride reads as a bump — and one that
 * runs off the map ends past the fog, where its shelf may stop as it
 * likes. */
type Lane = { name: string; line: SpurLine; maxGrade: number; before: number; after: number };

/** Every road that hangs off the stage. The railway is not one — nobody
 * drives it, and the train's ballast is its own surface. */
function lanesOf(track: Track, terrain: TerrainField): Lane[] {
  const lanes: Lane[] = [];
  const F = STAGE_RULES.elevation.follow;
  const L = ANALYSIS.lanes;
  for (const spur of track.spurs) {
    if (spur.rail) continue;
    lanes.push({
      name: `the ${spur.end} arm @${spur.atS.toFixed(0)} m`,
      line: spur,
      maxGrade: F.grade,
      before: 0,
      after: 0,
    });
  }
  for (const road of track.publicRoads) {
    lanes.push({
      name: `the public road @${road.atS.toFixed(0)} m`,
      line: road,
      maxGrade: SPUR.maxGrade,
      before: 0,
      after: 0,
    });
  }
  for (const h of track.homesteads) {
    lanes.push({
      name: `the drive @${h.atS.toFixed(0)} m`,
      line: h.drive,
      maxGrade: F.grade,
      before: 0,
      after: L.past,
    });
  }
  for (const park of terrain.carParks) {
    lanes.push({
      name: `the car park lane @${park.atS.toFixed(0)} m`,
      line: park.road,
      maxGrade: STAGE_RULES.carPark.road.maxGrade,
      before: 0,
      after: L.past,
    });
  }
  return lanes;
}

/** The line at arc position `s` — interpolated between its samples, and
 * carried straight on past either end. */
function along(line: SpurLine, s: number): { x: number; z: number; heading: number } {
  const S = line.samples;
  if (S.length === 1) return S[0];
  let i = 0;
  while (i < S.length - 2 && S[i + 1].s < s) i++;
  const a = S[i];
  const b = S[i + 1];
  const run = b.s - a.s;
  const t = run > 1e-6 ? (s - a.s) / run : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    heading: t < 0.5 ? a.heading : b.heading,
  };
}

export function analyzeLanes(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const L = ANALYSIS.lanes;
  const lanes = lanesOf(track, terrain);

  let strides = 0;
  let steps = 0;
  let breaks = 0;
  let bumps = 0;
  let worstStep = 0;
  let worstBump = 0;
  let graded = 0;
  let steep = 0;
  let worstGrade = 0;
  let crests = 0;
  let worstCrest = 0;
  let stood = 0;
  let off = 0;
  let worstOff = 0;

  for (const lane of lanes) {
    const S = lane.line.samples;
    if (S.length < 2) continue;
    const length = S[S.length - 1].s - S[0].s;

    // ── THE GROUND, along three balls ──────────────────────────────────
    const offsets = [0, L.track, -L.track];
    for (const lateral of offsets) {
      const heights: { s: number; x: number; z: number; y: number }[] = [];
      for (let s = S[0].s - lane.before; s <= S[0].s + length + lane.after; s += L.stride) {
        const p = along(lane.line, s);
        const x = p.x + Math.cos(p.heading) * lateral;
        const z = p.z - Math.sin(p.heading) * lateral;
        heights.push({ s, x, z, y: terrain.groundAt(x, z) });
      }
      for (let i = 1; i < heights.length; i++) {
        strides++;
        const grade = Math.abs(heights[i].y - heights[i - 1].y) / L.stride;
        if (grade > L.step.warn) {
          steps++;
          if (grade > L.step.fail) breaks++;
          if (grade > worstStep) {
            worstStep = grade;
            findings.push({
              code: "lanes.step",
              severity: grade > L.step.fail ? "error" : "warn",
              message: `a ${(grade * L.stride).toFixed(2)} m step over ${L.stride} m on ${lane.name}, ${heights[i].s.toFixed(0)} m along it`,
              at: { x: heights[i].x, z: heights[i].z },
              s: lane.line.atS,
              value: grade,
            });
          }
        }
        if (i + 1 >= heights.length) continue;
        const bump = Math.abs(heights[i - 1].y - 2 * heights[i].y + heights[i + 1].y);
        if (bump > L.bump.warn) {
          bumps++;
          if (bump > worstBump) {
            worstBump = bump;
            findings.push({
              code: "lanes.bump",
              severity: bump > L.bump.fail ? "error" : "warn",
              message: `a ${bump.toFixed(2)} m bump on ${lane.name}, ${heights[i].s.toFixed(0)} m along it`,
              at: { x: heights[i].x, z: heights[i].z },
              s: lane.line.atS,
              value: bump,
            });
          }
        }
      }
    }

    // ── THE PROFILE, as laid ───────────────────────────────────────────
    let slope = 0;
    for (let i = 1; i < S.length; i++) {
      const run = S[i].s - S[i - 1].s;
      if (run < 1e-3) continue;
      graded++;
      const grade = (S[i].elevation - S[i - 1].elevation) / run;
      if (Math.abs(grade) > lane.maxGrade + L.gradeSlack) {
        steep++;
        if (Math.abs(grade) > worstGrade) {
          worstGrade = Math.abs(grade);
          findings.push({
            code: "lanes.grade",
            severity: Math.abs(grade) > L.gradeFail ? "error" : "warn",
            message: `${lane.name} runs at ${(grade * 100).toFixed(0)}% ${S[i].s.toFixed(0)} m along it`,
            at: { x: S[i].x, z: S[i].z },
            s: lane.line.atS,
            value: Math.abs(grade),
          });
        }
      }
      if (i > 1) {
        const crest = Math.abs(grade - slope) / run;
        if (crest > L.crest.warn) {
          crests++;
          if (crest > worstCrest) {
            worstCrest = crest;
            findings.push({
              code: "lanes.crest",
              severity: crest > L.crest.fail ? "error" : "warn",
              message: `${lane.name} bends from ${(slope * 100).toFixed(0)}% to ${(grade * 100).toFixed(0)}% over ${run.toFixed(0)} m, ${S[i].s.toFixed(0)} m along it`,
              at: { x: S[i].x, z: S[i].z },
              s: lane.line.atS,
              value: crest,
            });
          }
        }
      }
      slope = grade;
    }

    // ── THE GROUND UNDER THE PROFILE ───────────────────────────────────
    for (const sample of S) {
      stood++;
      const apart = Math.abs(terrain.groundAt(sample.x, sample.z) - sample.elevation);
      if (apart > L.agree.warn) {
        off++;
        if (apart > worstOff) {
          worstOff = apart;
          findings.push({
            code: "lanes.agree",
            severity: apart > L.agree.fail ? "error" : "warn",
            message: `the ground stands ${apart.toFixed(2)} m off ${lane.name} ${sample.s.toFixed(0)} m along it`,
            at: { x: sample.x, z: sample.z },
            s: lane.line.atS,
            value: apart,
          });
        }
      }
    }
  }

  const tolerated = L.tolerated;
  const checks: Check[] = [
    {
      id: "step",
      label: "no step on any road off the stage",
      score: rate(steps + breaks * 4, Math.max(1, strides), tolerated),
      weight: 2,
      value: worstStep,
      budget: L.step.warn,
    },
    {
      id: "bump",
      label: "no bump between two even strides",
      score: rate(bumps, Math.max(1, strides), tolerated),
      weight: 1.5,
      value: worstBump,
      budget: L.bump.warn,
    },
    {
      id: "grade",
      label: "laid no steeper than a minor road",
      score: rate(steep, Math.max(1, graded), tolerated),
      weight: 1,
      value: worstGrade,
      budget: STAGE_RULES.carPark.road.maxGrade + L.gradeSlack,
    },
    {
      id: "crest",
      label: "bends no faster than a minor road's crest rule",
      score: rate(crests, Math.max(1, graded), tolerated),
      weight: 1,
      value: worstCrest,
      budget: L.crest.warn,
    },
    {
      id: "agree",
      label: "the ridden ground is the road as laid",
      score: rate(off, Math.max(1, stood), tolerated),
      weight: 1,
      value: worstOff,
      budget: L.agree.warn,
    },
  ];

  return {
    id: "lanes",
    label: "The other roads",
    score: metricScore(checks),
    weight: ANALYSIS.weights.lanes,
    checks,
    findings,
    stats: {
      lanes: lanes.length,
      metres: Math.round(
        lanes.reduce((sum, lane) => sum + lane.line.samples.length * SPUR.step, 0),
      ),
      strides,
      worstStep,
      worstBump,
      worstGrade,
      worstCrest,
      worstOff,
    },
    ms: Date.now() - started,
  };
}
