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
//   real ones all continue past the edge of what you were given. A SEALED
//   road that does it is worse again: somebody laid a tarmac road, and
//   tarmac is laid to reach somewhere.
//
//   A tarmac road that turns into a gravel one. A surface change is a
//   place — a junction, where the rally leaves the public road (R17). One
//   that happens in the middle of nowhere, with no junction and nothing to
//   explain it, says the road was drawn in two passes by two people who
//   never spoke.
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

import { ROAD_CROSS, roadClearance } from "../mapgen/road.ts";
import { SPUR, type Spur } from "../mapgen/spurs.ts";
import { createHighwayNetwork } from "../mapgen/highway.ts";
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
  points: { x: number; z: number; heading: number; s: number; y: number }[];
  /** Branches only: the MEETING POINT this one hangs off. Inside R23's own
   * exemption around it (`junction.parting`) the two carriageways ARE one
   * road, which is what a junction is — so the sweep has to skip exactly
   * the ground the branch builder was allowed to ignore, or every junction
   * on the map reports as two roads sharing it.
   *
   * A PLACE, not a stretch of arc, for the same reason the rule is one: an
   * arc window exempts whatever the route happens to be doing hundreds of
   * metres away, which on seeds 1-12 hid every branch that actually lay on
   * it. */
  meet: { x: number; z: number } | null;
  /** ...and where on the STAGE that crossing is, m of route arc. */
  atS: number;
};

/** Everything on the map that is a road, on one common spacing so a
 * proximity sweep between two of them is comparing like with like. */
function strands(track: Track, spacing: number): Strand[] {
  const out: Strand[] = [];
  const routeStride = Math.max(1, Math.round(spacing / track.step));
  const route: Strand = { id: "route", points: [], meet: null, atS: 0 };
  for (let i = 0; i < track.samples.length; i += routeStride) {
    const s = track.samples[i];
    route.points.push({ x: s.x, z: s.z, heading: s.heading, s: s.s, y: s.elevation });
  }
  out.push(route);
  track.spurs.forEach((spur, index) => {
    const stride = Math.max(1, Math.round(spacing / SPUR.step));
    const points: Strand["points"] = [];
    for (let i = 0; i < spur.samples.length; i += stride) {
      const p = spur.samples[i];
      points.push({ x: p.x, z: p.z, heading: p.heading, s: i * SPUR.step, y: p.elevation });
    }
    const first = spur.samples[0];
    out.push({
      id: `branch ${index + 1}`,
      points,
      meet: first ? { x: first.x, z: first.z } : null,
      atS: spur.atS,
    });
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

  // ── R17 — DOES THE GRAVEL CROSS THE TARMAC? ───────────────────────────
  //
  // The one thing the road network must never do, and the reason the whole
  // model was turned round. The sealed roads are laid on the bare country
  // before the rally is routed over it (`highway.ts`): they are what was
  // there first, they go somewhere, and a rally stage does not drive across
  // a public road at speed. It meets one at a junction, borrows it, and
  // turns off — so every metre of gravel keeps R23's clearance from every
  // metre of tarmac, and the only ground the two share is the crossing.
  //
  // Measured against the LAID roads rather than against the branches,
  // because those are only the pieces of them the stage happens to touch.
  // A route that cut across the middle of a public road half a kilometre
  // from its junction would be invisible to a check that only knew about
  // the arms, and that is exactly the mistake worth catching.
  //
  // The junctions are exempt, and only the junctions: `junction.parting`
  // metres of ground around each meeting point, which is the same
  // exemption the branch builder and the parallel sweep below use. It is
  // the crossing itself.
  let crossings = 0;
  let worstCrossing = 0;
  if (track.highways.length > 0) {
    const parting = STAGE_RULES.junction.parting;
    const network = createHighwayNetwork(track.highways);
    for (const sample of track.samples) {
      if (sample.surface !== "gravel") continue;
      const hit = network.nearest(sample.x, sample.z, undefined, clear);
      if (hit === null) continue;
      // Exempt where the piece of TARMAC in question is at a junction, not
      // where the piece of gravel is: the two roads part slowly, so the
      // route can be a hundred and fifty metres from a crossing while the
      // road beside it is still fifty. Same predicate as the rule the
      // search planned against (`generate.ts`'s `clearOfTarmac`).
      const at = hit.road.points[hit.index];
      if (track.junctions.some((j) => Math.hypot(j.x - at.x, j.z - at.z) < parting)) continue;
      crossings++;
      if (clear - hit.d <= worstCrossing) continue;
      worstCrossing = clear - hit.d;
      findings.push({
        code: "roads.cross",
        severity: hit.d < track.width ? "error" : "warn",
        message:
          hit.d < track.width
            ? `the rally drives ${hit.d.toFixed(0)} m from the middle of a public road at ${sample.s.toFixed(0)} m — gravel crosses tarmac, it does not join it (R17)`
            : `the gravel runs ${hit.d.toFixed(
                0,
              )} m from a public road at ${sample.s.toFixed(0)} m, at no junction — inside the ${clear.toFixed(0)} m two roads need (R23)`,
        at: { x: sample.x, z: sample.z },
        s: sample.s,
        value: clear - hit.d,
      });
    }
  }

  // ── Where does each branch GO? ────────────────────────────────────────
  let stranded = 0;
  let stubs = 0;
  let degraded = 0;
  let unsealed = 0;
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

    // R17 — a SEALED road is held to the harder bar, and a branch is one:
    // it is the tarmac the route borrowed, carried on past the junction.
    // Somebody laid it, and tarmac is laid to reach somewhere — so a lake
    // or the road it may not cross is a reason it STOPPED, never a reason
    // it was right to stop there. It has to be out of sight when it does.
    if (out < R.escape) {
      unsealed++;
      findings.push({
        code: "roads.sealed",
        severity: "error",
        message: `the tarmac of branch ${i + 1} stops ${Math.max(0, -out).toFixed(
          0,
        )} m inside the map (${spur.endsAt === "water" ? "at water" : spur.endsAt === "stage" ? "at the stage" : "for no reason"}) — a sealed road leads somewhere`,
        at: { x: end.x, z: end.z },
        s: spur.atS,
        value: Math.max(0, R.escape - out),
      });
    }

    // ...and it is tarmac the whole way. A surface change is a PLACE (R17);
    // one part-way down a branch, with no junction at it, is a road that
    // gave up being a road.
    const changes = spur.samples.filter(
      (sample, k) => k > 0 && sample.surface !== spur.samples[k - 1].surface,
    );
    if (changes.length > 0) {
      degraded++;
      const at = changes[0];
      findings.push({
        code: "roads.degrade",
        severity: "error",
        message: `branch ${i + 1} stops being tarmac ${at.s.toFixed(
          0,
        )} m along it, at no junction — a sealed road does not turn to gravel in a field`,
        at: { x: at.x, z: at.z },
        s: spur.atS,
        value: end.s - at.s,
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
  let steps = 0;
  let worstStep = 0;
  let parallelRun = 0;
  let longestParallel = 0;
  const near = R.parallelNear * clear;
  const selfNear = R.selfNear * clear;
  const parallels: Finding[] = [];
  /** R31 — how much height two roads this far apart may have between them:
   * the stage's own verge cone, stated the way `compile.ts`'s `shelfHolds`
   * states it, so the check and the rule cannot drift. Half the sweep's
   * spacing is added to the bench because the nearest point of the other
   * road can lie between two of the ones walked, and this may only ever
   * forgive the roads more than the rule does, never less. */
  const bench = Math.max(track.width / 2 + ROAD_CROSS.reach, STAGE_RULES.verge.bench) + spacing / 2;
  const coneAt = (d: number): number => Math.max(0, d - bench) * STAGE_RULES.verge.climb;
  for (let a = 0; a < roads.length; a++) {
    for (let b = a; b < roads.length; b++) {
      const self = a === b;
      // Along one strand, only pairs far enough apart ALONG it can be a
      // parallel run — the neighbours of a point are trivially near it and
      // pointing the same way, which is what a road is.
      const window = clear * 4;
      // R23's junction exemption, and it has to be the SAME PREDICATE the
      // route was planned against or the two disagree about every crossing.
      //
      // The rule (`generate.ts`'s `clearOfTarmac`) reads: a route point may
      // come inside the clearance of a piece of TARMAC only where that
      // piece is within `junction.parting` of a meeting point. So the thing
      // measured against the meeting point is the ROAD's end of the pair,
      // never the route's. Measured the other way round — exempting route
      // points near the meeting point — it flags every junction whose two
      // roads part slowly, because there the route is a hundred and fifty
      // metres from the crossing while the tarmac beside it is still fifty:
      // 24 errors over seeds 1-24, none of them a defect.
      const branch = roads[a].meet !== null ? roads[a] : roads[b].meet !== null ? roads[b] : null;
      const exempt = branch !== null && (roads[a].meet === null || roads[b].meet === null);
      const parting = STAGE_RULES.junction.parting;
      /** Is this pair of points the CROSSING rather than two roads sharing
       * ground? Both ends have to be in it, and each is measured the way
       * the rule measures it (`generate.ts`'s `clearOfTarmac`): the branch
       * by its distance from the meeting point, the route by how far along
       * its own arc it is from the junction. A junction is a place the
       * route passes through once — measured on the branch alone, a route
       * that left a crossing and came back alongside the same road two
       * hundred metres later is still exempt. */
      const crossing = (
        onRoute: { x: number; z: number; s: number },
        onBranch: { x: number; z: number },
      ): boolean =>
        exempt &&
        branch !== null &&
        branch.meet !== null &&
        Math.abs(onRoute.s - branch.atS) < parting &&
        Math.hypot(onBranch.x - branch.meet.x, onBranch.z - branch.meet.z) < parting;
      // A road against itself is judged on its own numbers: a switchback is
      // not a doubled ribbon.
      const reach = self ? selfNear : near;
      const minRun = self ? R.selfRun : R.parallelRun;
      let run = 0;
      let runFrom: { x: number; z: number } | null = null;
      const routeIsA = roads[a].meet === null;
      for (const p of roads[a].points) {
        let hit: { x: number; z: number; d: number } | null = null;
        for (const q of roads[b].points) {
          if (crossing(routeIsA ? p : q, routeIsA ? q : p)) continue;
          if (self && Math.abs(p.s - q.s) < window) continue;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d > reach) continue;
          // R31 — and how far apart in HEIGHT, because that is what decides
          // what the country between them has to be. Two roads that keep
          // R23's distance may still be tens of metres apart vertically, and
          // the ground joining them is then a face rather than a hillside:
          // the same defect as a road on stilts, and the one the picture
          // shows as a raw earth wall down the side of a stage.
          //
          // TWO roads, never one against itself. R31's cone is a rule about
          // what a road's SHELF does to the road beside it, and the stage
          // against its own switchback is not that: the terrain gives the
          // ground to whichever of the two arms is nearer and the country
          // between them is one hillside, which is what a road climbing a
          // hill looks like. Measured over seeds 1-8, every finding this
          // raised with the self case in was a switchback on a slope well
          // under `verge.climb` — the check reporting the design.
          const drop = Math.abs(p.y - q.y);
          if (!self && drop > coneAt(d) && drop > R.stepFloor) {
            steps++;
            if (drop > worstStep) {
              worstStep = drop;
              findings.push({
                code: "roads.step",
                severity: drop >= R.stepFail ? "error" : "warn",
                message: `${roads[a].id} and ${roads[b].id} pass ${d.toFixed(
                  0,
                )} m apart with ${drop.toFixed(
                  1,
                )} m of height between them — the country in between is a face, not a hillside (R31)`,
                at: { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 },
                value: drop,
              });
            }
          }
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

  // ── R20 — DOES THE TARMAC SWEEP? A sealed section is a public road the
  // rally borrowed, laid out by a highway authority for traffic that is
  // not racing, and a hairpin on one reads as a race track painted grey.
  // The tight corners belong to the rally's own gravel.
  //
  // Measured in METRES of sealed road tighter than the ceiling, as a share
  // of the sealed road there is — not as a worst radius, because the whole
  // question is how much of the borrowed road a driver spends doubling
  // back on. A single sample clipping the bar is nothing; forty metres of
  // it is a hairpin.
  //
  // The JUNCTIONS themselves are exempt, and deliberately. A minor road
  // leaving a main one at a sharp angle is a T-junction, which is the most
  // ordinary thing on any map; the tarmac that reaches into it is the
  // crossing, and R17 owns how that is built. What this is looking for is
  // tight sealed road out in the middle of a run, where nothing explains
  // it.
  let tightSealed = 0;
  let sealedRun = 0;
  let tightestSealed = Infinity;
  let tightestAt: { x: number; z: number; s: number } | null = null;
  for (const sample of track.samples) {
    if (sample.surface !== "asphalt" || sample.deck != null) continue;
    sealedRun += track.step;
    if (track.junctions.some((j) => Math.abs(j.s - sample.s) <= R.sweepClear)) continue;
    const radius = Math.abs(sample.curvature) > 1e-6 ? 1 / Math.abs(sample.curvature) : Infinity;
    if (radius >= STAGE_RULES.paving.minRadius) continue;
    tightSealed += track.step;
    if (radius >= tightestSealed) continue;
    tightestSealed = radius;
    tightestAt = { x: sample.x, z: sample.z, s: sample.s };
  }
  const tightShare = sealedRun > 0 ? tightSealed / sealedRun : 0;
  if (tightShare > R.sweeps && tightestAt) {
    findings.push({
      code: "roads.sweeps",
      severity: "error",
      message: `${tightSealed.toFixed(0)} m of the sealed road bends to ${tightestSealed.toFixed(
        0,
      )} m — a public road does not have a hairpin in it (R20)`,
      at: { x: tightestAt.x, z: tightestAt.z },
      s: tightestAt.s,
      value: tightShare - R.sweeps,
    });
  }

  // ── R17 — WHERE THE ROUTE'S OWN SURFACE CHANGES. The branches are held
  // to this above (`roads.degrade`); the road the player actually drives
  // was not held to it at all, and it is the one they are looking at.
  //
  // A surface change is a PLACE: the route arrives on one road, turns onto
  // the other, and the road it turned off carries on past the crossing. One
  // in the middle of a straight is a tarmac road that becomes a gravel road
  // for no reason — the loudest of the two classic mistakes in this file's
  // header, and the reason it is worth measuring on the route is that R20
  // makes exactly that trade deliberately: where a borrowed road runs into
  // a corner too tight for a public road, the surfacing simply ends. That
  // is a real, argued exception (see `compile.ts`) and it is still a thing
  // a player sees, so it is COUNTED rather than hidden — the budget says
  // how much of it a stage may carry, and a change that removes some of it
  // shows up here as fewer metres of orphaned surfacing.
  //
  // A ford is not a surface change of this kind: the water is the crossing,
  // and R13 owns it.
  let orphanFlips = 0;
  for (let i = 1; i < track.samples.length; i++) {
    const before = track.samples[i - 1];
    const after = track.samples[i];
    if (before.surface === after.surface) continue;
    if (before.surface === "water" || after.surface === "water") continue;
    if (before.deck != null || after.deck != null) continue;
    if (track.junctions.some((j) => Math.abs(j.s - after.s) <= R.sweepClear)) continue;
    orphanFlips++;
    findings.push({
      code: "roads.orphan",
      severity: "warn",
      message: `the route stops being ${before.surface} ${after.s.toFixed(
        0,
      )} m in, at no junction — a surface change is a place two roads meet (R17)`,
      at: { x: after.x, z: after.z },
      s: after.s,
      value: 1,
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
      id: "cross",
      label: "the gravel never crosses the tarmac, it joins it (R17)",
      score: under(worstCrossing, 0, clear),
      weight: 3,
      value: worstCrossing,
    },
    {
      id: "step",
      label: "no cliff between two roads that pass each other (R31)",
      score: under(worstStep, R.stepFail, R.stepFail * 3),
      weight: 2.5,
      value: worstStep,
      budget: R.stepFail,
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
      id: "sealed",
      label: "every tarmac road runs off the map",
      score: rate(unsealed, Math.max(1, track.spurs.length)),
      weight: 2.5,
      value: unsealed,
    },
    {
      id: "sweeps",
      label: "the sealed road sweeps rather than doubling back (R20)",
      score: under(tightShare, R.sweeps, R.sweeps * 8),
      weight: 2,
      value: tightShare,
      budget: R.sweeps,
    },
    {
      id: "degrade",
      label: "no tarmac road turns to gravel in a field",
      score: rate(degraded, Math.max(1, track.spurs.length)),
      weight: 2,
      value: degraded,
    },
    {
      id: "orphan",
      label: "the ROUTE only changes surface where two roads meet (R17)",
      score: under(orphanFlips, R.orphans, R.orphans + 3),
      weight: 2,
      value: orphanFlips,
      budget: R.orphans,
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
      unsealed,
      degraded,
      orphanFlips,
      stubs,
      breaches,
      crossings,
      steps,
      worstStep,
      parallelRuns: parallelRun,
      longestParallel,
      coverage,
      boxFill,
    },
    ms: Date.now() - started,
  };
}
