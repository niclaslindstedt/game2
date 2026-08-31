// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO ENDS OF A STAGE — the start line and the finish line, and the
// road either side of them.
//
// Everything else in this module is a matter of degree: a river that is a
// little too narrow, a corner that is a little too tight. The ends are not.
// They are PASS OR FAIL, because what hangs off them is not quality, it is
// whether the mode works at all:
//
//   THE START has to hold the whole heads-up field. A mass start stands
//   every car in the race on the apron behind the gate, one per row, and if
//   the apron is not long enough the field does not fit — there is no
//   graceful degradation, the race is simply smaller than it was meant to
//   be. Then the field has to be able to LEAVE: sixteen cars launching into
//   a corner two car lengths up the road is not a start, it is a pile-up,
//   so the road ahead of the gate has to stay straight long enough for the
//   grid to string out.
//
//   THE FINISH has to be crossable and then survivable. The clock stops on
//   a PLANE across the road (`crossedFinish`), which means a car that drove
//   round the gate did not finish and a car that flew over it did — so the
//   line has to sit on road straight enough that the plane spans it. And
//   past the line the car is still doing rally pace with the controls taken
//   away from the run, so R25's run-out has to be there, straight, and
//   free of anything that would end the run after it had ended.
//
// The grid geometry is read from the REAL grid code (`sim/grid.ts`), not
// re-derived here. A start-line check that agrees with its own copy of the
// rules and disagrees with the game is worse than no check at all.

import { TUNING } from "../game/defs/tuning.ts";
import { gateHalfWidth } from "../game/track.ts";
import { APRON_HOLDS, GRID_MAX, massStartGrid } from "../sim/grid.ts";
import { finishIndex, type Track } from "../mapgen/compile.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, under, type Check, type Finding, type MetricReport } from "./types.ts";

/** How straight a run of road is, as the sharpest radius anywhere in it, m
 * — Infinity on a dead straight. Walked from `from` for `run` meters, or
 * to whichever end of the samples comes first. */
function tightestIn(track: Track, from: number, run: number): number {
  let tightest = Infinity;
  const forward = run >= 0;
  for (let i = 0; i < track.samples.length; i++) {
    const along = track.samples[i].s - from;
    if (forward ? along < 0 || along > run : along > 0 || along < run) continue;
    const curvature = Math.abs(track.samples[i].curvature);
    if (curvature < 1e-6) continue;
    const radius = 1 / curvature;
    if (radius < tightest) tightest = radius;
  }
  return tightest;
}

/** The world position of a grid slot: `back` meters behind the first
 * sample along its heading, `lateral` meters right of the centre. The apron
 * is road extrapolated straight off sample 0 (R24), so this is a straight
 * walk backwards and not a search along the samples. */
function slotAt(track: Track, back: number, lateral: number): { x: number; z: number } {
  const s = track.samples[0];
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const rx = Math.cos(s.heading);
  const rz = -Math.sin(s.heading);
  return { x: s.x - fx * back + rx * lateral, z: s.z - fz * back + rz * lateral };
}

export function analyzeEnds(track: Track, terrain: TerrainField): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const E = ANALYSIS.ends;
  const checks: Check[] = [];
  const half = track.width / 2;
  const body = TUNING.collision.halfWidth;

  // ── Does the apron hold the field? ────────────────────────────────────
  // A rule property rather than a seed property — the apron is the same
  // length on every stage — but it is reported per stage because it is the
  // thing that decides whether this stage can be raced heads up at all.
  //
  // The APRON is what is measured, not `GRID_MAX`. GRID_MAX is the apron
  // capped by the roster, and a roster too small to dress a full field is a
  // different problem in a different module: the generator's job here is to
  // lay down enough road.
  const holds = APRON_HOLDS;
  if (holds < E.grid) {
    findings.push({
      code: "ends.grid",
      severity: "error",
      message: `the start apron holds ${holds} cars — a heads-up field is ${E.grid}. It needs ${(
        (E.grid - 1) * TUNING.massStart.rowGap +
        TUNING.collision.halfLength
      ).toFixed(0)} m of apron (STAGE_RULES.startZone.apron is ${STAGE_RULES.startZone.apron})`,
      value: E.grid - holds,
    });
  }
  if (GRID_MAX < E.grid && holds >= E.grid) {
    findings.push({
      code: "ends.roster",
      severity: "note",
      message: `the apron holds ${holds} cars but the roster only dresses ${GRID_MAX} — a fuller heads-up field needs more crews (sim/rivals.ts), not more road`,
      value: E.grid - GRID_MAX,
    });
  }
  checks.push({
    id: "grid",
    label: "the apron holds a heads-up field",
    score: holds >= E.grid ? 1 : 0,
    weight: 3,
    value: holds,
    budget: E.grid,
  });

  // ── Does every car on it stand on road, on the flat, in the clear? ────
  const grid = massStartGrid(Math.min(E.grid, holds));
  let offRoad = 0;
  let obstructed = 0;
  let worstTilt = 0;
  const gridY = terrain.groundAt(track.samples[0].x, track.samples[0].z);
  for (const slot of grid) {
    const at = slotAt(track, slot.back, slot.lateral);
    if (Math.abs(slot.lateral) + body > half) {
      offRoad++;
      findings.push({
        code: "ends.stand",
        severity: "error",
        message: `grid slot ${slot.number} hangs ${(Math.abs(slot.lateral) + body - half).toFixed(
          2,
        )} m off the edge of a ${track.width.toFixed(1)} m road`,
        at,
        value: Math.abs(slot.lateral) + body - half,
      });
    }
    const solids = [
      ...terrain.obstaclesNear(at.x, at.z, E.slotClear),
      ...terrain.treesNear(at.x, at.z, E.slotClear),
    ];
    if (solids.length > 0) {
      obstructed++;
      findings.push({
        code: "ends.blocked",
        severity: "error",
        message: `a ${solids[0].kind} stands in grid slot ${slot.number}`,
        at,
        value: solids.length,
      });
    }
    // The apron is one straight plane, so a slot standing well off the
    // start gate's own height means the ground under the grid is not the
    // ground the cars are placed on.
    const tilt = Math.abs(terrain.groundAt(at.x, at.z) - gridY);
    if (tilt > worstTilt) worstTilt = tilt;
  }
  if (worstTilt > E.apronStep) {
    findings.push({
      code: "ends.apron",
      severity: "warn",
      message: `the apron under the grid is ${worstTilt.toFixed(2)} m out of level end to end`,
      at: slotAt(track, STAGE_RULES.startZone.apron, 0),
      value: worstTilt,
    });
  }
  checks.push(
    {
      id: "stand",
      label: "every grid slot stands on the road",
      score: offRoad === 0 ? 1 : 0,
      weight: 2,
      value: offRoad,
    },
    {
      id: "blocked",
      label: "nothing solid stands on the grid",
      score: obstructed === 0 ? 1 : 0,
      weight: 2,
      value: obstructed,
    },
    {
      id: "apron",
      label: "the apron under the grid is level",
      score: under(worstTilt, E.apronStep, E.apronStep * 4),
      weight: 1,
      value: worstTilt,
      budget: E.apronStep,
    },
  );

  // ── Can the field LEAVE? The run from the back row to the first corner
  // is what decides whether a mass start strings out or piles up, so it is
  // measured from where the LAST car is stood, not from the gate.
  const gridDepth = grid.length > 0 ? grid[grid.length - 1].back : 0;
  const launchRadius = tightestIn(track, 0, E.launch);
  const launchRun = gridDepth + E.launch;
  const launchOk = launchRadius >= E.launchRadius;
  if (!launchOk) {
    findings.push({
      code: "ends.launch",
      severity: "error",
      message: `the first corner off the line is a ${launchRadius.toFixed(
        0,
      )} m radius inside ${E.launch} m of the gate — a ${grid.length}-car grid ${gridDepth.toFixed(
        0,
      )} m deep arrives at it still stacked`,
      s: 0,
      value: E.launchRadius - launchRadius,
    });
  }
  checks.push({
    id: "launch",
    label: "the field has a straight to string out on",
    score: launchOk ? 1 : 0,
    weight: 2.5,
    value: Math.min(launchRadius, 9999),
    budget: E.launchRadius,
  });

  // ── The finish. A circuit's finish IS its start line, with a whole lap
  // of road the other side of it, so it owes no run-out (R25) — and an
  // endless stage never finishes at all.
  if (!track.endless) {
    const at = finishIndex(track);
    const gate = track.samples[at];
    const finishS = track.finishS ?? gate.s;

    // Crossable: the clock stops on a PLANE across the road, and a plane
    // laid across a tight corner is a line a car can drive around.
    const gateRadius = tightestIn(track, finishS - E.gate, E.gate * 2);
    const crossable = gateRadius >= E.gateRadius;
    if (!crossable) {
      findings.push({
        code: "ends.gate",
        severity: "error",
        message: `the finish gate sits on a ${gateRadius.toFixed(
          0,
        )} m radius — the line is a plane ${(gateHalfWidth(track) * 2).toFixed(
          1,
        )} m wide and a car can be round the corner before it meets it`,
        at: { x: gate.x, z: gate.z },
        s: finishS,
        value: E.gateRadius - gateRadius,
      });
    }
    checks.push({
      id: "gate",
      label: "the finish line spans road a car must cross",
      score: crossable ? 1 : 0,
      weight: 2.5,
      value: Math.min(gateRadius, 9999),
      budget: E.gateRadius,
    });

    // Approached down a straight (R2): no blind final turn.
    const approachRadius = tightestIn(track, finishS, -STAGE_RULES.closingStraight);
    checks.push({
      id: "approach",
      label: "the finish is approached down a straight (R2)",
      score: approachRadius >= E.approachRadius ? 1 : 0,
      weight: 1.5,
      value: Math.min(approachRadius, 9999),
      budget: E.approachRadius,
    });
    if (approachRadius < E.approachRadius) {
      findings.push({
        code: "ends.approach",
        severity: "warn",
        message: `the last ${STAGE_RULES.closingStraight} m into the line bends to a ${approachRadius.toFixed(
          0,
        )} m radius`,
        at: { x: gate.x, z: gate.z },
        s: finishS,
        value: E.approachRadius - approachRadius,
      });
    }

    if (!track.circuit) {
      // R25 — the run-out: road past the gate for the car to settle down on
      // once the clock has stopped and the run has taken the controls.
      const runOut = track.length - finishS;
      const wanted = STAGE_RULES.runOut * E.runOutShare;
      if (runOut < wanted) {
        findings.push({
          code: "ends.runout",
          severity: "error",
          message: `only ${runOut.toFixed(0)} m of road past the finish gate — R25 asks for ${
            STAGE_RULES.runOut
          }`,
          at: { x: gate.x, z: gate.z },
          s: finishS,
          value: wanted - runOut,
        });
      }
      checks.push({
        id: "runout",
        label: "there is road past the line to settle down on (R25)",
        score: runOut >= wanted ? 1 : 0,
        weight: 2,
        value: runOut,
        budget: STAGE_RULES.runOut,
      });

      // ...and it has to be road worth coasting down: straight, and with
      // nothing on it that would catch a car nobody is steering any more.
      const settleRadius = tightestIn(track, finishS, E.settle);
      let hazards = 0;
      for (const sample of track.samples) {
        if (sample.s < finishS || sample.s > finishS + E.settle) continue;
        if (sample.jump || sample.surface === "water") hazards++;
      }
      // R36 — and a LEVEL CROSSING is one, though it carries no lip flag:
      // the step is the public road's formation rather than a jump the
      // generator built, and it throws the car exactly the same way. The
      // closing straight is placed after the search has finished, so nothing
      // should be able to put one here — which is the reason to measure it
      // rather than to assume it.
      for (const junction of track.junctions) {
        if (!junction.crossing) continue;
        if (junction.s < finishS || junction.s > finishS + E.settle) continue;
        hazards++;
      }
      const settled = settleRadius >= E.settleRadius && hazards === 0;
      if (!settled) {
        findings.push({
          code: "ends.settle",
          severity: "warn",
          message: hazards
            ? `the run-out past the finish has a jump or a ford on it`
            : `the run-out bends to a ${settleRadius.toFixed(0)} m radius within ${E.settle} m`,
          at: { x: gate.x, z: gate.z },
          s: finishS,
          value: hazards ? hazards : E.settleRadius - settleRadius,
        });
      }
      checks.push({
        id: "settle",
        label: "the run-out is straight and clear",
        score: settled ? 1 : 0,
        weight: 1.5,
        value: Math.min(settleRadius, 9999),
        budget: E.settleRadius,
      });
    }
  }

  return {
    id: "ends",
    label: "start & finish",
    score: metricScore(checks),
    weight: ANALYSIS.weights.ends,
    checks,
    findings,
    stats: {
      gridHolds: holds,
      gridDepth,
      launchRun,
      launchRadius: Math.min(launchRadius, 9999),
      runOut: track.finishS === null ? 0 : track.length - track.finishS,
    },
    ms: Date.now() - started,
  };
}
