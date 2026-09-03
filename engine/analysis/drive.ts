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

import { CARS } from "../game/defs/cars.ts";
import { clipKerbs } from "../game/collision.ts";
import { freshCar } from "../game/car-state.ts";
import type { GameEvent } from "../game/state.ts";
import { createKerbField, type KerbMarker } from "../mapgen/kerbs.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import { isLoose, type Track, type TrackSample } from "../mapgen/compile.ts";
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
  // R36 — and a LEVEL CROSSING's ramps, for the same reason and with the
  // same care. The public road stands on a formation and the rally climbs
  // onto it, so the two ramps are steep and the far lip throws the car:
  // that is the feature, not a defect in the road, and measured as ordinary
  // road it is a 20% grade and a heave over the budget every single time.
  //
  // Bounded by the RAMP, which is the thing that is steep — the same arc
  // window the compiler raises the road over (`crossingRamp`): the graded
  // top, plus `crossing.ramp` of gravel either side of it. Not by `flat`,
  // which is the PAVING and stops at the platform's rim: the ramps are
  // ordinary gravel with their crown and camber intact, so keyed on that
  // the exemption covered the flat part and left the steep part reported.
  for (const junction of track.junctions) {
    if (!junction.crossing) continue;
    const reach = 0.72 * junction.spread + STAGE_RULES.crossing.ramp;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i].s - junction.s) > reach) continue;
      // One sample past each end: the grade at the last ramped sample is
      // read across its neighbours, and the outer one is open road.
      for (let k = Math.max(0, i - 1); k <= Math.min(samples.length - 1, i + 1); k++) {
        feature[k] = true;
      }
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
    //
    // Measured over a LONG baseline, and that is the whole subtlety. What
    // this check is about is the road heaving the BODY — and a body on
    // springs follows the road's long shape and lets the suspension eat
    // everything shorter. Read over two samples it also reads R33's surface
    // grain, which is a five-metre wave: the arithmetic then says a hundred
    // metres per second squared and the truth is that the dampers took it
    // and the driver felt texture. Anything shorter than the car's own
    // wheelbase belongs to the suspension, not to this.
    const span = Math.max(1, Math.round(D.heaveSpan / track.step));
    // Only where the whole baseline is road: clamped to the stage's ends
    // the second difference is one-sided, and a run-out on a plain grade
    // read as a compression twice the budget on the last sample of one
    // stage in three.
    if (i - span < 0 || i + span >= samples.length) continue;
    const lo = samples[i - span];
    const hi = samples[i + span];
    const halfRun = Math.max(1e-3, (hi.s - lo.s) / 2);
    const secondDiff = (hi.elevation - 2 * here.elevation + lo.elevation) / (halfRun * halfRun);
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
  const tilt = cornerTilt(track, findings);
  const rolling = undulation(track, findings);
  const kerb = apexTariff(track, findings);
  const straight = longestStraight(track, v, findings);

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
      // R19 — and the other half of the camber question: not merely that a
      // corner is banked the right WAY, but that it is banked at all.
      id: "tilt",
      label: "gravel corners lie over into the turn rather than flat (R19)",
      score: tilt === null ? 1 : within(tilt, D.tilt, D.tiltSlack),
      weight: 1.5,
      value: tilt ?? 0,
      budget: D.tilt.min,
    },
    {
      // R34 — and the road is laid ALONG a country rather than ruled across
      // one. A band: a stage that never climbs or falls is a table, and one
      // that never stops is a rollercoaster.
      id: "rolling",
      label: "the road rises and falls with the country it crosses (R34)",
      score: within(rolling, D.rolling, D.rollingSlack),
      weight: 1.5,
      value: rolling,
      budget: D.rolling.min,
    },
    {
      // R26 — what cutting an apex over the blocks actually costs.
      id: "kerb",
      label: "an apex cut over the blocks costs speed without ending the run (R26)",
      score: kerb === null ? 1 : within(kerb, D.kerb, D.kerbSlack),
      weight: 1.5,
      value: kerb ?? 0,
      budget: D.kerb.max,
    },
    {
      // R38 — and the opposite complaint from `ambush`: not a corner with
      // no road in front of it, but road with no corner in front of it.
      id: "straight",
      label: "no straight runs longer than five seconds (R38)",
      score: under(straight.seconds, D.straight, D.straightFail),
      weight: 1.5,
      value: straight.seconds,
      budget: D.straight,
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
      cornerTilt: tilt ?? 0,
      travelPerKm: rolling,
      apexTariff: kerb ?? 0,
      longestStraightS: straight.seconds,
      longestStraightM: straight.meters,
      straightsOverBudget: straight.over,
    },
    ms: Date.now() - started,
  };
}

/** R38 — THE LONGEST THE STAGE ASKS FOR NOTHING, in seconds of driving.
 *
 * A stage is corners joined by straights. This is the check that says so:
 * it walks the raced road, marks every metre the wheel is merely being
 * held, and times the longest unbroken stretch of it at the speed the
 * profile says that stretch is met at.
 *
 * TIME, not length, because length is not what the player experiences.
 * Two hundred metres out of a hairpin is second gear, third, a glance at
 * the pace note; the same two hundred entered at 200 km/h is three
 * seconds of nothing. Only the clock tells those apart, and the clock is
 * what the ask was stated in.
 *
 * The RACED stage only (R11): the run-out past the finish is road the
 * clock never sees and is a straight on purpose, and the opening straight
 * is measured like any other because a grid still has to sit through it.
 *
 * Every over-budget stretch is reported, not just the worst — a stage
 * with one nine-second runway and a stage with four six-second ones are
 * different complaints, and the findings are where the difference shows. */
function longestStraight(
  track: Track,
  v: number[],
  findings: Finding[],
): { seconds: number; meters: number; over: number } {
  const D = ANALYSIS.drive;
  const samples = track.samples;
  const finish = track.finishS ?? track.length;
  let worst = 0;
  let worstMeters = 0;
  let over = 0;
  let seconds = 0;
  let meters = 0;
  let from = 0;

  const close = (at: TrackSample): void => {
    if (seconds > worst) {
      worst = seconds;
      worstMeters = meters;
    }
    if (seconds > D.straight) {
      over++;
      findings.push({
        code: "drive.straight",
        severity: seconds > D.straightFail ? "error" : "warn",
        message: `${meters.toFixed(0)} m of straight — ${seconds.toFixed(
          1,
        )} s with nothing to steer for`,
        at: { x: at.x, z: at.z },
        s: from,
        value: seconds - D.straight,
      });
    }
    seconds = 0;
    meters = 0;
  };

  for (let i = 1; i < samples.length; i++) {
    const here = samples[i];
    if (here.s > finish) break;
    const step = here.s - samples[i - 1].s;
    const speed = Math.max(1, v[i]);
    if (Math.abs(here.curvature) * D.straightRadius < 1) {
      if (meters === 0) from = samples[i - 1].s;
      meters += step;
      seconds += step / speed;
    } else if (seconds > 0) {
      close(samples[i - 1]);
    }
  }
  if (seconds > 0) close(samples[samples.length - 1]);
  return { seconds: worst, meters: worstMeters, over };
}

/** R19 — HOW FAR OVER A GRAVEL CORNER ACTUALLY LIES, as the median
 * cross-fall of the samples that are in one, m per m. Null on a stage with
 * no gravel corners, which is not a stage this can say anything about.
 *
 * The median rather than the worst, because what is being asked is whether
 * the ROAD is tilted — a stage can have one hairpin laid right over and
 * still read flat everywhere a driver spends their time. And gravel only:
 * a sealed corner's superelevation is designed, reserved for the geometry
 * that needs it, and a public road that is flat through a fourth-gear
 * sweeper is not wrong (`STAGE_RULES.bank`).
 *
 * Read off `sample.bank` rather than probed off the terrain, because the
 * bank IS the number the whole corridor is built from: the renderer, the
 * physics and the ground beside the road all read it (road.ts), so
 * measuring it here measures all three. */
function cornerTilt(track: Track, findings: Finding[]): number | null {
  const D = ANALYSIS.drive;
  const banks: number[] = [];
  for (const sample of track.samples) {
    if (!isLoose(sample.surface) || sample.deck != null) continue;
    if ((sample.flat ?? 0) > 0.01) continue;
    if (Math.abs(sample.curvature) < D.tiltAt) continue;
    banks.push(Math.abs(sample.bank));
  }
  if (banks.length === 0) return null;
  banks.sort((a, b) => a - b);
  const tilt = banks[Math.floor(banks.length / 2)];
  if (tilt < D.tilt.min) {
    findings.push({
      code: "drive.tilt",
      severity: "note",
      message: `gravel corners lie over ${(tilt * 100).toFixed(1)}% — flat ground with a road painted on it`,
      value: D.tilt.min - tilt,
    });
  }
  return tilt;
}

/** R34 — HOW UNEVEN THE ROAD IS: metres of climb and descent per kilometre
 * of it. Add up every step the surface takes, up or down, and divide by the
 * distance — the simplest honest statement of "this road is not a plane",
 * and the one number that moves when the road is laid closer along the
 * country (`STAGE_RULES.elevation.follow.lag`).
 *
 * The whole road, both surfaces, because this is a question about the LINE
 * and not about what it is surfaced with. Jumps are stepped over: a lip is
 * a metre of climb inside twenty, and a stage with three of them would read
 * as rolling country for having three ramps on it.
 *
 * A band, not a floor. A stage that never leaves its own datum is a table
 * with a ribbon on it — but the far end is a road that is never level long
 * enough to settle the car, which is not rally country either, and the sim
 * finds it as air time. */
function undulation(track: Track, findings: Finding[]): number {
  const D = ANALYSIS.drive;
  const samples = track.samples;
  const span = Math.ceil(ANALYSIS.rollers.jumpSkip / track.step);
  const skip = new Array<boolean>(samples.length).fill(false);
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].jump) continue;
    for (let k = Math.max(0, i - span); k <= Math.min(samples.length - 1, i + span); k++) {
      skip[k] = true;
    }
  }
  let travel = 0;
  let run = 0;
  for (let i = 1; i < samples.length; i++) {
    if (skip[i] || skip[i - 1]) continue;
    travel += Math.abs(samples[i].elevation - samples[i - 1].elevation);
    run += samples[i].s - samples[i - 1].s;
  }
  const perKm = run > 0 ? travel / (run / 1000) : 0;
  if (perKm < D.rolling.min) {
    findings.push({
      code: "drive.rolling",
      severity: "note",
      message: `the road travels ${perKm.toFixed(0)} m up and down per km — a stage laid on a table`,
      value: D.rolling.min - perKm,
    });
  } else if (perKm > D.rolling.max) {
    findings.push({
      code: "drive.rolling",
      severity: "warn",
      message: `the road travels ${perKm.toFixed(0)} m up and down per km — the car never settles`,
      value: perKm - D.rolling.max,
    });
  }
  return perKm;
}

/** R26 — WHAT AN APEX CUT COSTS, as the share of its speed the reference
 * car loses running the length of a row of anti-cut blocks. Null on a stage
 * with no such row.
 *
 * DRIVEN, not derived. The tariff is `TUNING.collision.kerb` compounded
 * over however many blocks the car gets to meet before the row shoves it
 * off, and that is a loop, not a formula — so the check runs the real
 * `clipKerbs` against the real markers and reads the speedometer at the
 * end. Which means it measures the thing the player actually meets, and
 * moving any of the collision numbers moves this.
 *
 * WHY IT IS A BAND. A block that costs nothing is not a deterrent, and the
 * whole reason the generator lays them is to make cutting the corner a
 * choice rather than a free line. A block that costs everything is worse:
 * an apex lined with them stopped the car dead, which reads as a wall
 * somebody left in the road and takes the run with it. Somewhere around a
 * fifth is a price a driver pays on purpose.
 *
 * The worst row on the stage is what is reported, because that is the one
 * that decides whether the stage has a corner nobody may go near. */
function apexTariff(track: Track, findings: Finding[]): number | null {
  const D = ANALYSIS.drive;
  const field = createKerbField(track);
  const rows: KerbMarker[][] = [];
  let row: KerbMarker[] = [];
  for (const marker of field.markers) {
    if (marker.kind !== "block") continue;
    const last = row[row.length - 1];
    if (last && (last.side !== marker.side || marker.s - last.s > D.kerbRowGap)) {
      rows.push(row);
      row = [];
    }
    row.push(marker);
  }
  if (row.length > 0) rows.push(row);

  const spec = CARS[0];
  let worst: number | null = null;
  let worstAt: KerbMarker | null = null;
  for (const blocks of rows) {
    if (blocks.length < 2) continue;
    const head = blocks[0];
    const tail = blocks[blocks.length - 1];
    // Down the line of the row, which is the line a car cutting the apex
    // takes: the blocks are laid along the inside edge of the bend.
    const heading = Math.atan2(tail.x - head.x, tail.z - head.z);
    const kept = driveTheRow(field, spec, head, heading, D.kerbSpeed);
    const lost = 1 - kept;
    if (worst === null || lost > worst) {
      worst = lost;
      worstAt = head;
    }
  }
  if (worst !== null && worst > D.kerb.max && worstAt) {
    findings.push({
      code: "drive.kerb",
      severity: "error",
      message: `cutting an apex over the blocks takes ${(worst * 100).toFixed(
        0,
      )}% of the car's speed — that is a wall, not a kerb`,
      at: { x: worstAt.x, z: worstAt.z },
      s: worstAt.s,
      value: worst - D.kerb.max,
    });
  } else if (worst !== null && worst < D.kerb.min) {
    findings.push({
      code: "drive.kerb",
      severity: "note",
      message: `cutting an apex over the blocks costs ${(worst * 100).toFixed(
        0,
      )}% — the corner can be straightened for free`,
      value: D.kerb.min - worst,
    });
  }
  return worst;
}

/** Run the reference car down a row of blocks from `from` on `heading` at
 * `speed`, and report the share of that speed it comes out with. No physics
 * but the kerbing: the car is carried forward by its own velocity and the
 * only thing that touches it is `clipKerbs`, so what comes back is the
 * kerbing's own tariff rather than a lap of a stage. */
function driveTheRow(
  field: ReturnType<typeof createKerbField>,
  spec: (typeof CARS)[number],
  from: KerbMarker,
  heading: number,
  speed: number,
): number {
  const D = ANALYSIS.drive;
  const car = freshCar();
  car.heading = heading;
  car.u = speed;
  // Start a car's length short of the first block, and on its own foot, so
  // the height gate in `clipKerbs` is met the way it is on the road.
  car.x = from.x - Math.sin(heading) * 4;
  car.z = from.z - Math.cos(heading) * 4;
  car.y = from.y;
  const events: GameEvent[] = [];
  let t = 0;
  for (let step = 0; step < D.kerbSteps; step++) {
    const blocks = field.blocksNear(car.x, car.z, 2.5);
    // The car rides the row: it is ON the corridor the blocks are bedded
    // into, not floating over it, so the height gate is met the way it is
    // on the stage rather than by however far the road has climbed since
    // the first block.
    if (blocks.length > 0) car.y = blocks[0].y;
    clipKerbs(spec, car, t, blocks, events);
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    car.x += (car.u * sinH + car.w * cosH) * ANALYSIS.drive.kerbStep;
    car.z += (car.u * cosH - car.w * sinH) * ANALYSIS.drive.kerbStep;
    car.heading += car.yawRate * ANALYSIS.drive.kerbStep;
    t += ANALYSIS.drive.kerbStep;
  }
  return Math.hypot(car.u, car.w) / speed;
}
