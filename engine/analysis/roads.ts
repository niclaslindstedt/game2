// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD NETWORK, judged as a network rather than as a route.
//
// The generator validates the racing line: it is legal, it does not cross
// itself, it fits the world. What it cannot see from inside the search is
// what the whole set of roads LOOKS like from a kilometre up — and that is
// the altitude at which the two classic mistakes are obvious.
//
//   A road that ends in a field. Roads go somewhere. A branch that stops
//   in open country, with nothing at the end of it and nothing on the far
//   side, is the single loudest tell that a landscape was generated: the
//   real ones all continue past the edge of what you were given.
//
//   Two roads running side by side. Legal — they never touch — and still
//   wrong, because a country does not lay two carriageways a hundred
//   metres apart across the same empty valley. It reads as one road drawn
//   twice, which is what it is.
//
// Plus the thing the generator has no opinion about at all: DISTRIBUTION.
// A stage that folds itself into one corner of its world leaves the rest
// of the map as scenery nobody drives through, and one that scribbles road
// over every hectare of it leaves nowhere to be lost.

import { roadClearance } from "../mapgen/road.ts";
import { SPUR, type Spur } from "../mapgen/spurs.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import type { Track } from "../mapgen/compile.ts";
import { ANALYSIS } from "./budgets.ts";
import {
  metricScore,
  rate,
  under,
  within,
  type Check,
  type Finding,
  type MetricReport,
} from "./types.ts";

/** A piece of road reduced to what a network question needs: where it goes
 * and which way it is pointing there. */
type Strand = {
  id: string;
  points: { x: number; z: number; heading: number; s: number }[];
  /** Branches only: where on the STAGE this one hangs off. Inside R23's
   * own exemption around it (`junction.spurWindow`) the two carriageways
   * ARE one road, which is what a junction is — so the sweep has to skip
   * exactly the stretch the branch builder was allowed to ignore, or every
   * junction on the map reports as two roads sharing ground. */
  joinS: number | null;
};

/** Everything on the map that is a road, on one common spacing so a
 * proximity sweep between two of them is comparing like with like. */
function strands(track: Track, spacing: number): Strand[] {
  const out: Strand[] = [];
  const routeStride = Math.max(1, Math.round(spacing / track.step));
  const route: Strand = { id: "route", points: [], joinS: null };
  for (let i = 0; i < track.samples.length; i += routeStride) {
    const s = track.samples[i];
    route.points.push({ x: s.x, z: s.z, heading: s.heading, s: s.s });
  }
  out.push(route);
  track.spurs.forEach((spur, index) => {
    const stride = Math.max(1, Math.round(spacing / SPUR.step));
    const points: Strand["points"] = [];
    for (let i = 0; i < spur.samples.length; i += stride) {
      const p = spur.samples[i];
      points.push({ x: p.x, z: p.z, heading: p.heading, s: i * SPUR.step });
    }
    out.push({ id: `branch ${index + 1}`, points, joinS: spur.atS });
  });
  return out;
}

/** How far off parallel two headings are, radians, folded so opposite
 * directions count as parallel — two roads pointing at each other's tails
 * are as much side by side as two pointing the same way. */
function offParallel(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d > Math.PI / 2 ? Math.PI - d : d;
}

export function analyzeRoads(track: Track): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const R = ANALYSIS.roads;
  const clear = roadClearance(track.width);
  // Coarse enough that the O(n·m) sweep below stays in milliseconds, fine
  // enough that a 130 m parallel run cannot fall between two samples.
  const spacing = 20;
  const roads = strands(track, spacing);

  // ── Where does each branch GO? ────────────────────────────────────────
  let stranded = 0;
  let stubs = 0;
  for (let i = 0; i < track.spurs.length; i++) {
    const spur: Spur = track.spurs[i];
    const end = spur.samples[spur.samples.length - 1];
    if (!end) continue;
    const box = track.bounds;
    const out = Math.max(box.minX - end.x, end.x - box.maxX, box.minZ - end.z, end.z - box.maxZ);
    // A branch that stopped on a shore or short of the road it may not
    // cross has a REASON to have stopped, and the reason is visible from
    // the car. One that simply ran out in dry open country does not.
    if (out < R.escape && spur.endsAt === "map") {
      stranded++;
      findings.push({
        code: "roads.stranded",
        severity: "error",
        message: `branch ${i + 1} ends in open country ${Math.max(0, -out).toFixed(
          0,
        )} m inside the stage's own bounds`,
        at: { x: end.x, z: end.z },
        value: Math.max(0, R.escape - out),
      });
    }
    const length = spur.samples.length * SPUR.step;
    if (length < SPUR.length.min * 0.5) {
      stubs++;
      findings.push({
        code: "roads.stub",
        severity: "warn",
        message: `branch ${i + 1} is only ${length.toFixed(0)} m long — a stub, not a road`,
        at: { x: end.x, z: end.z },
        value: SPUR.length.min - length,
      });
    }
  }

  // ── Does anything run alongside anything else? ────────────────────────
  // Every pair of strands, plus each strand against its own distant self:
  // a route that comes back on its own line a kilometre later is exactly
  // as wrong as two roads that do it, and R10's self-distance floor is far
  // too small to catch a parallel run.
  let breaches = 0;
  let worstBreach = 0;
  let parallelRun = 0;
  let longestParallel = 0;
  const near = R.parallelNear * clear;
  const selfNear = R.selfNear * clear;
  const parallels: Finding[] = [];
  for (let a = 0; a < roads.length; a++) {
    for (let b = a; b < roads.length; b++) {
      const self = a === b;
      // Along one strand, only pairs far enough apart ALONG it can be a
      // parallel run — the neighbours of a point are trivially near it and
      // pointing the same way, which is what a road is.
      const window = clear * 4;
      // R23's junction exemption, from the rule book the branch builder
      // measured against: the route beside a branch's own junction is that
      // branch's road, not another one.
      const joined = roads[a].joinS ?? roads[b].joinS;
      const exempt =
        joined !== null && (roads[a].joinS === null || roads[b].joinS === null) ? joined : null;
      // A road against itself is judged on its own numbers: a switchback is
      // not a doubled ribbon.
      const reach = self ? selfNear : near;
      const minRun = self ? R.selfRun : R.parallelRun;
      let run = 0;
      let runFrom: { x: number; z: number } | null = null;
      for (const p of roads[a].points) {
        if (
          exempt !== null &&
          roads[a].joinS === null &&
          Math.abs(p.s - exempt) < STAGE_RULES.junction.spurWindow
        ) {
          continue;
        }
        let hit: { x: number; z: number; d: number } | null = null;
        for (const q of roads[b].points) {
          if (
            exempt !== null &&
            roads[b].joinS === null &&
            Math.abs(q.s - exempt) < STAGE_RULES.junction.spurWindow
          ) {
            continue;
          }
          if (self && Math.abs(p.s - q.s) < window) continue;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d > reach) continue;
          if (d < clear) {
            breaches++;
            if (clear - d > worstBreach) {
              worstBreach = clear - d;
              findings.push({
                code: "roads.overlap",
                severity: "error",
                message: `${roads[a].id} and ${roads[b].id} pass ${d.toFixed(
                  0,
                )} m apart — inside the ${clear.toFixed(0)} m two roads need (R23)`,
                at: { x: p.x, z: p.z },
                value: clear - d,
              });
            }
          }
          if (offParallel(p.heading, q.heading) > R.parallelAngle) continue;
          if (!hit || d < hit.d) hit = { x: p.x, z: p.z, d };
        }
        if (hit) {
          run += spacing;
          runFrom = runFrom ?? hit;
          if (run > longestParallel) longestParallel = run;
        } else {
          if (run >= minRun && runFrom) {
            parallelRun++;
            parallels.push({
              code: "roads.parallel",
              severity: "warn",
              message: `${roads[a].id} and ${roads[b].id} run side by side for ${run.toFixed(0)} m`,
              at: runFrom,
              value: run,
            });
          }
          run = 0;
          runFrom = null;
        }
      }
      if (run >= minRun && runFrom) {
        parallelRun++;
        parallels.push({
          code: "roads.parallel",
          severity: "warn",
          message: `${roads[a].id} and ${roads[b].id} run side by side for ${run.toFixed(0)} m`,
          at: runFrom,
          value: run,
        });
      }
    }
  }
  findings.push(...parallels);

  // ── How the roads are spread over the country they were given ─────────
  const b = track.bounds;
  const width = Math.max(1, b.maxX - b.minX);
  const depth = Math.max(1, b.maxZ - b.minZ);
  const boxFill = Math.min(width, depth) / Math.max(width, depth);
  const cells = 64;
  let covered = 0;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = b.minX + ((i + 0.5) / cells) * width;
      const z = b.minZ + ((j + 0.5) / cells) * depth;
      let best = Infinity;
      for (const road of roads) {
        for (const p of road.points) {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < best) best = d;
          if (best < R.coverageReach) break;
        }
        if (best < R.coverageReach) break;
      }
      if (best < R.coverageReach) covered++;
    }
  }
  const coverage = covered / (cells * cells);

  if (coverage > R.coverage.max) {
    findings.push({
      code: "roads.coverage",
      severity: "warn",
      message: `${(coverage * 100).toFixed(
        0,
      )}% of the map is within sight of a road — the country is more road than land`,
      value: coverage - R.coverage.max,
    });
  } else if (coverage < R.coverage.min) {
    findings.push({
      code: "roads.coverage",
      severity: "note",
      message: `only ${(coverage * 100).toFixed(0)}% of the map is near a road`,
      value: R.coverage.min - coverage,
    });
  }
  if (boxFill < R.boxFill.min) {
    findings.push({
      code: "roads.spread",
      severity: "warn",
      message: `the route runs down a ${(boxFill * 100).toFixed(
        0,
      )}%-square corridor instead of using the country`,
      value: R.boxFill.min - boxFill,
    });
  }

  const points = roads.reduce((sum, road) => sum + road.points.length, 0);
  const checks: Check[] = [
    {
      id: "stranded",
      label: "every branch runs off the map",
      score: rate(stranded, Math.max(1, track.spurs.length)),
      weight: 2.5,
      value: stranded,
    },
    {
      id: "overlap",
      label: "no two roads share ground (R23)",
      score: rate(breaches, Math.max(1, points)),
      weight: 3,
      value: worstBreach,
      budget: clear,
    },
    {
      id: "parallel",
      label: "no two roads run side by side",
      score: under(longestParallel, R.parallelRun, R.parallelRun * 4),
      weight: 1.5,
      value: longestParallel,
      budget: R.parallelRun,
    },
    {
      id: "stubs",
      label: "no branch is a stub",
      score: rate(stubs, Math.max(1, track.spurs.length)),
      weight: 1,
      value: stubs,
    },
    {
      id: "coverage",
      label: "the roads are spread over the country",
      score: within(coverage, R.coverage, ANALYSIS.ground.slack),
      weight: 1,
      value: coverage,
    },
    {
      id: "spread",
      label: "the route uses the world it was given",
      score: within(boxFill, R.boxFill, 0.4),
      weight: 1,
      value: boxFill,
    },
  ];

  return {
    id: "roads",
    label: "road network",
    score: metricScore(checks),
    weight: ANALYSIS.weights.roads,
    checks,
    findings,
    stats: {
      branches: track.spurs.length,
      stranded,
      stubs,
      breaches,
      parallelRuns: parallelRun,
      longestParallel,
      coverage,
      boxFill,
    },
    ms: Date.now() - started,
  };
}
