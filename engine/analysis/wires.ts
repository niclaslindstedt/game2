// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GRID, MEASURED (R45). The transmission line is planned against the
// SURVEY — the bare country, and the route's own samples where a road
// stands over it. What gets built is neither: the terrain shapes the ground
// around every road, pad and clearing on the map, and the wire hangs where
// the towers actually ended up standing.
//
// That gap is the whole reason this metric exists, and it has already paid
// for itself once: a span planned to clear a road by twelve metres cleared
// the BUILT road by seven, because the road rides an embankment the survey
// never saw. Nothing else on the analyzer would have said so — the towers
// were legal, the spans were in band, and the only wrong number was one
// nobody was measuring.
//
// So the five questions are the ones a line inspector would ask, in the
// order the damage matters:
//
//   IS THERE AIR UNDER IT. Every span, sampled along its length against the
//   ground the car actually drives, keeps R45's clearance — more where it
//   crosses a road, because that is the one place anybody is under it.
//
//   IS EVERY TOWER SOMEWHERE A TOWER COULD BE. Off every road's corridor,
//   out of the water, and on ground level enough across its own base that
//   its legs reach it.
//
//   ARE THE SPANS A LINE'S. Inside the band the tension was designed for,
//   with the stretched ones the exception rather than the rule.
//
//   DOES IT CROSS THE COUNTRY. A line that begins or ends inside the fog is
//   a line with a cut end standing in a field, which is the loudest mistake
//   on the map — worse than no line at all.
//
//   IS THE RIDE CUT. The wayleave carries no trunks: a spruce under a
//   400 kV conductor is not a stage that looks unmaintained, it is a stage
//   that looks like nobody drew the corridor.

import { STAGE_RULES } from "../mapgen/rules.ts";
import { pylonLegs, spanSag, underWayleave } from "../mapgen/powerline.ts";
import { ROAD_CROSS } from "../mapgen/road.ts";
import type { Track } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, under, type Check, type Finding, type MetricReport } from "./types.ts";

const P = STAGE_RULES.powerline;
const W = ANALYSIS.wires;

/** R45 — measure every transmission line on a stage. A stage with no line
 * on it scores a clean sheet on every check: most of them have none, and a
 * country without a grid is not a country with a broken one. */
export function analyzeWires(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const half = track.width / 2;
  const corridor = half + ROAD_CROSS.reach;

  let towers = 0;
  let badTowers = 0;
  let spans = 0;
  let stretched = 0;
  let shortSpans = 0;
  let lowSpans = 0;
  let worstClearance = Infinity;
  let leastAir = Infinity;
  let strandedEnds = 0;
  let ends = 0;
  let wayleaveProbes = 0;
  let trunksUnder = 0;

  for (const line of track.powerLines) {
    // ── Every tower somewhere a tower could be ─────────────────────────
    for (const pylon of line.pylons) {
      towers++;
      const wrong: string[] = [];
      const road = terrain.roadDistanceAt(pylon.x, pylon.z);
      if (road < P.clear.route - corridor - W.clearSlack) {
        wrong.push(`${road.toFixed(0)} m off the road's edge`);
      }
      const legs = pylonLegs(pylon);
      let lo = Infinity;
      let hi = -Infinity;
      for (const leg of legs) {
        if (terrain.waterAt(leg.x, leg.z) !== null) wrong.push("a leg in the water");
        const y = terrain.groundAt(leg.x, leg.z);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
      // The ground the terrain BUILT, not the country the survey read: a
      // tower at the top of a cutting stands on ground the road blasted.
      if (hi - lo > P.tower.level * W.levelSlack) {
        wrong.push(`${(hi - lo).toFixed(1)} m of fall across its base`);
      }
      if (wrong.length === 0) continue;
      badTowers++;
      findings.push({
        code: "wires.towers",
        severity: "error",
        message: `a transmission tower has ${[...new Set(wrong)].join(", ")} (R45)`,
        at: { x: pylon.x, z: pylon.z },
        value: wrong.length,
      });
    }

    // ── Air under every span, and spans a line would have ──────────────
    for (let i = 0; i + 1 < line.pylons.length; i++) {
      const a = line.pylons[i];
      const b = line.pylons[i + 1];
      const length = b.span;
      spans++;
      if (length > P.span.max + 1) stretched++;
      if (length < P.span.min - 1) {
        shortSpans++;
        findings.push({
          code: "wires.spans",
          severity: "warn",
          message: `a span of ${length.toFixed(0)} m — under the line's own shortest (R45)`,
          at: { x: a.x, z: a.z },
          value: P.span.min - length,
        });
      }
      // The conductor's own attachment heights, off the ground the terrain
      // made under each tower's legs rather than off the survey's guess.
      const foot = (p: (typeof line.pylons)[number]): number =>
        Math.max(...pylonLegs(p).map((leg) => terrain.groundAt(leg.x, leg.z)));
      const ay = foot(a) + line.height - P.wire.insulator;
      const by = foot(b) + line.height - P.wire.insulator;
      let worst = Infinity;
      let worstAt = { x: a.x, z: a.z };
      let worstNeed: number = P.clearance.ground;
      const steps = Math.max(4, Math.ceil(length / W.step));
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const wire = ay + (by - ay) * t - spanSag(length, t);
        const ground = terrain.groundAt(x, z);
        const air = wire - ground;
        if (air < leastAir) leastAir = air;
        const overRoad = terrain.roadDistanceAt(x, z) < W.roadReach;
        const need = overRoad ? P.clearance.road : P.clearance.ground;
        const slack = air - need;
        if (slack < worst) {
          worst = slack;
          worstAt = { x, z };
          worstNeed = need;
        }
      }
      // The running minimum is a STAT and the violation is a finding: two
      // things, and folding them into one `continue` meant a span that hung
      // two metres low went unreported behind one that hung five.
      if (worst < worstClearance) worstClearance = worst;
      if (worst >= 0) continue;
      lowSpans++;
      findings.push({
        code: "wires.clearance",
        severity: "error",
        message: `a ${length.toFixed(0)} m span hangs ${(worstNeed + worst).toFixed(1)} m over the ground, ${(-worst).toFixed(1)} m under what it owes (R45)`,
        at: worstAt,
        value: -worst,
      });
    }

    // ── Does it cross the country ──────────────────────────────────────
    // Both ends have to be outside the box the stage occupies, by more than
    // the fog can see: a line that stops where a player can watch it stop
    // is a cut end standing in a field.
    const b = track.bounds;
    for (const end of [line.pylons[0], line.pylons[line.pylons.length - 1]]) {
      ends++;
      const outside = Math.max(
        b.minX - end.x,
        end.x - b.maxX,
        b.minZ - end.z,
        end.z - b.maxZ,
        // ...or past the last piece of road, on a stage whose box is bigger
        // than its road: an end a kilometre from anything is out of sight
        // whatever the bounding box says.
        terrain.roadDistanceAt(end.x, end.z) - W.fog,
      );
      if (outside >= 0) continue;
      strandedEnds++;
      findings.push({
        code: "wires.crossing",
        severity: "error",
        message: `the line ends ${(-outside).toFixed(0)} m inside the country a player can see (R45)`,
        at: { x: end.x, z: end.z },
        value: -outside,
      });
    }

    // ── Is the ride cut ────────────────────────────────────────────────
    // Sampled down the middle of the wayleave, which is where a trunk is
    // unambiguously under the wire rather than at the corridor's edge.
    for (let i = 0; i + 1 < line.pylons.length; i++) {
      const a = line.pylons[i];
      const c = line.pylons[i + 1];
      const steps = Math.max(2, Math.ceil(c.span / W.wayleaveStep));
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const x = a.x + (c.x - a.x) * t;
        const z = a.z + (c.z - a.z) * t;
        if (!underWayleave(line, x, z)) continue;
        wayleaveProbes++;
        trunksUnder += terrain.treesNear(x, z, W.wayleaveProbe).length;
      }
    }
  }
  if (trunksUnder > 0) {
    findings.push({
      code: "wires.wayleave",
      severity: "warn",
      message: `${trunksUnder} trunk(s) standing under the conductors — the ride is not cut (R45)`,
      value: trunksUnder,
    });
  }

  const checks: Check[] = [
    {
      id: "clearance",
      label: "every span keeps its air over the ground it crosses (R45)",
      score: rate(lowSpans, Math.max(1, spans)),
      weight: 3,
      value: worstClearance === Infinity ? 0 : worstClearance,
      budget: 0,
    },
    {
      id: "towers",
      label: "every tower stands off the roads, out of the water and on the level (R45)",
      score: rate(badTowers, Math.max(1, towers)),
      weight: 2.5,
      value: badTowers,
    },
    {
      id: "crossing",
      label: "the line crosses the whole country and ends out of sight (R45)",
      score: rate(strandedEnds, Math.max(1, ends)),
      weight: 2,
      value: strandedEnds,
    },
    {
      id: "spans",
      label: "the spans are the ones the line's tension was designed for (R45)",
      score:
        rate(shortSpans, Math.max(1, spans)) *
        under(spans === 0 ? 0 : stretched / spans, W.stretchShare, W.stretchShare * 3),
      weight: 1,
      value: spans === 0 ? 0 : stretched / spans,
      budget: W.stretchShare,
    },
    {
      id: "wayleave",
      label: "no trunk stands under the conductors (R45)",
      score: rate(trunksUnder, Math.max(1, wayleaveProbes)),
      weight: 1,
      value: trunksUnder,
    },
  ];

  return {
    id: "wires",
    label: "The grid",
    score: metricScore(checks),
    weight: ANALYSIS.weights.wires,
    checks,
    findings,
    stats: {
      lines: track.powerLines.length,
      towers,
      spans,
      stretched,
      leastAir: leastAir === Infinity ? 0 : Math.round(leastAir * 10) / 10,
      worstClearance: worstClearance === Infinity ? 0 : Math.round(worstClearance * 10) / 10,
      trunksUnder,
    },
    ms: Date.now() - started,
  };
}
