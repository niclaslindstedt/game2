// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IS IT DRIVABLE? — the road judged against a car, rather than against the
// rule book that drew it.
//
// Every stage this generator ships is legal by construction: the search
// refuses anything that breaks a rule. Legal is not the same as drivable.
// A corner can be inside the vocabulary and still arrive with no room to
// brake for it, because the straight in front of it is a downhill. A crest
// can be a legal grade on both sides and still throw the car off the road
// because of how fast it is met. A corner can be banked, correctly, in the
// wrong direction. None of those is a rule violation and every one of them
// is a stage somebody stops playing.
//
// So this asks what the geometry does to a car moving at the speed the
// SPEED PROFILE (`speed.ts`) says it arrives at — the grade it has to
// climb, the crest it is thrown over, the way the corner is banked, how
// much speed the corner in front of it takes away.
//
// What happens once the car has LEFT the road is the jumps metric's
// (`jumps.ts`), and the whole jump — ramp, lip and landing zone — is
// exempt here: a ramp IS a compression met at speed and a lip IS a step.
// That is the feature, not a defect in it.

import { STAGE_RULES } from "../mapgen/rules.ts";
import type { Track, TrackSample } from "../mapgen/compile.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, under, type Check, type Finding, type MetricReport } from "./types.ts";

export function analyzeDrive(track: Track, v: number[]): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const D = ANALYSIS.drive;
  const samples = track.samples;

  let steep = 0;
  let broken = 0;
  let worstGrade = 0;
  let heaves = 0;
  let worstHeave = 0;
  let adverse = 0;
  let worstAdverse = 0;
  let corners = 0;
  let unbrakeable = 0;
  let graded = 0;

  // The jump's own ground, marked out so the grade and heave checks step
  // over it. Skipping only the lip sample reports the ramp under it as a
  // defect on every jump on every stage.
  const feature = new Array<boolean>(samples.length).fill(false);
  const runUp = Math.ceil((STAGE_RULES.jump.runUp + STAGE_RULES.jump.rampLength.max) / track.step);
  const landing = Math.ceil(STAGE_RULES.jump.landing / track.step);
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].jump) continue;
    for (let k = Math.max(0, i - runUp); k <= Math.min(samples.length - 1, i + landing); k++) {
      feature[k] = true;
    }
  }

  for (let i = 1; i < samples.length - 1; i++) {
    const before: TrackSample = samples[i - 1];
    const here: TrackSample = samples[i];
    const after: TrackSample = samples[i + 1];
    const run = Math.max(1e-3, after.s - before.s);
    if (feature[i]) continue;
    graded++;

    const grade = Math.abs(after.elevation - before.elevation) / run;
    if (grade > D.grade.warn) {
      steep++;
      if (grade > D.grade.fail) broken++;
      if (grade > worstGrade) {
        worstGrade = grade;
        findings.push({
          code: "drive.grade",
          severity: grade > D.grade.fail ? "error" : "warn",
          message: `the road runs at ${(grade * 100).toFixed(0)}% here`,
          at: { x: here.x, z: here.z },
          s: here.s,
          value: grade,
        });
      }
    }

    // Vertical acceleration over a crest or through a compression, at the
    // speed the profile says the car arrives at: v² times the curvature of
    // the elevation profile. A crest past the budget throws the car; a dip
    // past it puts the floor on the ground.
    const halfRun = run / 2;
    const secondDiff =
      (after.elevation - 2 * here.elevation + before.elevation) / (halfRun * halfRun);
    const heave = Math.abs(secondDiff) * v[i] * v[i];
    if (heave > D.heave) {
      heaves++;
      if (heave > worstHeave) {
        worstHeave = heave;
        findings.push({
          code: "drive.heave",
          severity: heave > D.heave * 2 ? "error" : "warn",
          message: `a ${secondDiff < 0 ? "crest" : "compression"} worth ${heave.toFixed(
            0,
          )} m/s² at the ${(v[i] * 3.6).toFixed(0)} km/h the road arrives at`,
          at: { x: here.x, z: here.z },
          s: here.s,
          value: heave,
        });
      }
    }

    // R19 banks INTO the turn: the cross-fall is `-bank * lateral`, so a
    // right-hand corner (curvature > 0) wants a positive bank. Tilted the
    // other way, the corner throws the car at its own outside edge.
    if (Math.abs(here.curvature) > 1 / 120 && Math.abs(here.bank) > D.adverse) {
      const wrongWay = Math.sign(here.bank) !== Math.sign(here.curvature);
      if (wrongWay) {
        adverse++;
        if (Math.abs(here.bank) > worstAdverse) {
          worstAdverse = Math.abs(here.bank);
          findings.push({
            code: "drive.adverse",
            severity: "warn",
            message: `a corner banked ${(Math.abs(here.bank) * 100).toFixed(1)}% the wrong way`,
            at: { x: here.x, z: here.z },
            s: here.s,
            value: Math.abs(here.bank),
          });
        }
      }
    }
  }

  // ── Braking zones. Walk the corner ENTRIES and ask what the profile had
  // to do to get there: a corner the car arrives at only by braking harder
  // than it can is one the search built without a run-up, whatever R4 says
  // about the straight in front of it.
  for (let i = 2; i < samples.length; i++) {
    const entering =
      Math.abs(samples[i].curvature) > 1 / 90 && Math.abs(samples[i - 1].curvature) <= 1 / 90;
    if (!entering) continue;
    corners++;
    // How fast the car would be if it had never lifted, against the speed
    // this corner actually holds.
    const held = v[i];
    let free = held;
    for (let k = i - 1; k >= 0 && samples[i].s - samples[k].s < 260; k--) {
      if (Math.abs(samples[k].curvature) > 1 / 90) break;
      free = Math.max(free, v[k]);
    }
    const drop = free - held;
    // The profile already guarantees the car CAN slow down in time — it
    // was built that way. What it cannot tell you is how much of the
    // straight the corner ate: a corner that takes more than two thirds of
    // the speed off the road in front of it is an ambush.
    if (free > 1 && drop / free > 0.68 && held < 22) {
      unbrakeable++;
      findings.push({
        code: "drive.ambush",
        severity: "warn",
        message: `a corner drops the car from ${(free * 3.6).toFixed(0)} to ${(held * 3.6).toFixed(
          0,
        )} km/h`,
        at: { x: samples[i].x, z: samples[i].z },
        s: samples[i].s,
        value: drop,
      });
    }
  }

  const pace = v.reduce((sum, speed) => sum + speed, 0) / Math.max(1, v.length);

  const checks: Check[] = [
    {
      id: "grade",
      label: "the road stays inside a grade a car can climb",
      score: rate(steep + broken * 3, Math.max(1, graded)),
      weight: 2,
      value: worstGrade,
      budget: D.grade.warn,
    },
    {
      id: "heave",
      label: "no crest or compression throws the car",
      score: rate(heaves, Math.max(1, graded)),
      weight: 2,
      value: worstHeave,
      budget: D.heave,
    },
    {
      id: "camber",
      label: "corners are banked into the turn (R19)",
      score: rate(adverse, Math.max(1, graded)),
      weight: 1.5,
      value: worstAdverse,
    },
    {
      id: "ambush",
      label: "no corner arrives without a run-up",
      score: rate(unbrakeable, Math.max(1, corners)),
      weight: 1.5,
      value: unbrakeable,
    },
    {
      id: "pace",
      label: "the stage flows rather than crawls",
      score: under(26 - Math.min(26, pace), 6, 20),
      weight: 1,
      value: pace,
    },
  ];

  return {
    id: "drive",
    label: "drivability",
    score: metricScore(checks),
    weight: ANALYSIS.weights.drive,
    checks,
    findings,
    stats: {
      corners,
      steep,
      broken,
      heaves,
      adverse,
      ambushes: unbrakeable,
      meanSpeed: pace,
    },
    ms: Date.now() - started,
  };
}
