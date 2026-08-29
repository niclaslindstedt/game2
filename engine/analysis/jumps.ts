// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE JUMPS — how far, how high, and whether the road is still there when
// the car comes down.
//
// A jump is the one place on a stage where the road stops being a
// constraint on where the car goes. Everywhere else the geometry leads: the
// car follows the ribbon because that is what the ribbon is for. Off a lip
// it does not — it travels in a STRAIGHT LINE, in the direction it left,
// for as long as gravity takes to bring it back, and where it lands is
// decided by physics rather than by the plan.
//
// Which is why this is its own metric rather than a line in the drivability
// walk. R6 places a lip on a straight with a run-up and a landing zone, and
// every one of those can hold while the jump is still wrong:
//
//   IT LANDS OFF THE ROAD. The landing zone is measured ALONG the stage. A
//   lip taken at 160 km/h throws the car a hundred metres, and if the road
//   turns inside that hundred metres the car comes down in the trees. The
//   samples under the flight all say "road" and the car is nowhere near
//   any of them.
//
//   IT IS TOO BIG. Height and length are what a jump IS — they are the
//   feature — so they are not defects, they are MEASUREMENTS, and this is
//   the only place they get taken. A stage whose jumps average four metres
//   of air is a different game from one whose jumps average one, and
//   nothing else in the loop would notice the difference.
//
//   IT LANDS TOO HARD. Coming down is the part that costs: a car arriving
//   with fourteen metres a second of vertical speed is a suspension
//   failure, not a landing, whatever the road under it is doing.
//
// The flight is plain ballistics off the lip's own ramp angle, walked in
// WORLD space and stopped against the terrain — not against the road's
// elevation profile, because past the edge of a corner the road's elevation
// is not what is under the car.

import { ROAD_CROSS } from "../mapgen/road.ts";
import { STAGE_RULES } from "../mapgen/rules.ts";
import type { Track, TrackSample } from "../mapgen/compile.ts";
import type { TerrainField } from "../mapgen/terrain.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, rate, under, type Check, type Finding, type MetricReport } from "./types.ts";

const GRAVITY = 9.81;

/** One jump, flown. */
type Flight = {
  lip: TrackSample;
  /** Speed the lip is met at, m/s. */
  speed: number;
  /** Ramp angle at the lip, radians. */
  pitch: number;
  /** Ground distance from lip to touchdown, m. */
  length: number;
  /** Most air under the car anywhere in the flight, m. */
  height: number;
  /** Time in the air, s. */
  air: number;
  /** Vertical speed at touchdown, m/s. */
  impact: number;
  land: { x: number; z: number };
  /** Distance from the touchdown point to the nearest road centerline, m. */
  offRoad: number;
  /** Anything solid the flight passed within a car's width of, at a height
   * it would have hit. */
  struck: number;
};

/** Fly one lip and measure what happens. */
function fly(track: Track, terrain: TerrainField, index: number, speed: number): Flight {
  const J = ANALYSIS.jumps;
  const samples = track.samples;
  const lip = samples[index];
  // The ramp's own grade at the lip — how much of the car's speed is
  // pointed upward when the road runs out from under it.
  const back = samples[Math.max(0, index - J.rampProbe)];
  const rise = (lip.elevation - back.elevation) / Math.max(1e-3, lip.s - back.s);
  const pitch = Math.atan(rise);
  const vy0 = speed * Math.sin(pitch);
  const vx = Math.max(1, speed * Math.cos(pitch));
  const fx = Math.sin(lip.heading);
  const fz = Math.cos(lip.heading);

  let length = 0;
  let height = 0;
  let air = 0;
  let impact = 0;
  let struck = 0;
  let land = { x: lip.x, z: lip.z };
  for (let step = J.step; step < J.maxFlight; step += J.step) {
    const t = step / vx;
    const y = lip.elevation + vy0 * t - 0.5 * GRAVITY * t * t;
    const x = lip.x + fx * step;
    const z = lip.z + fz * step;
    const ground = terrain.groundAt(x, z);
    length = step;
    air = t;
    land = { x, z };
    impact = Math.abs(vy0 - GRAVITY * t);
    const clearance = y - ground;
    if (clearance > height) height = clearance;
    // Anything solid standing in the flight path, at a height the car would
    // meet rather than clear.
    for (const solid of terrain.obstaclesNear(x, z, J.corridor)) {
      if (solid.y + solid.height > y) struck++;
    }
    if (clearance <= 0) break;
  }

  return {
    lip,
    speed,
    pitch,
    length,
    height,
    air,
    impact,
    land,
    offRoad: terrain.roadDistanceAt(land.x, land.z),
    struck,
  };
}

export function analyzeJumps(track: Track, terrain: TerrainField, speeds: number[]): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const J = ANALYSIS.jumps;
  const half = track.width / 2;
  /** How far off the centerline a landing is still ON the road: the mat and
   * the ribbon's own verge, which is ground the car can come down on and
   * drive away from. */
  const onRoad = half + ROAD_CROSS.reach;

  const flights: Flight[] = [];
  for (let i = 0; i < track.samples.length; i++) {
    if (!track.samples[i].jump) continue;
    flights.push(fly(track, terrain, i, speeds[i]));
  }

  let landedOff = 0;
  let tooLong = 0;
  let tooHigh = 0;
  let tooHard = 0;
  let obstructed = 0;
  let tight = 0;
  let maxLength = 0;
  let maxHeight = 0;
  let maxImpact = 0;
  let sumLength = 0;
  let sumHeight = 0;
  let lastLip = -Infinity;

  for (const flight of flights) {
    maxLength = Math.max(maxLength, flight.length);
    maxHeight = Math.max(maxHeight, flight.height);
    maxImpact = Math.max(maxImpact, flight.impact);
    sumLength += flight.length;
    sumHeight += flight.height;

    // THE one that matters: did the road catch it.
    if (flight.offRoad > onRoad) {
      landedOff++;
      findings.push({
        code: "jumps.offroad",
        severity: "error",
        message: `a jump taken at ${(flight.speed * 3.6).toFixed(0)} km/h throws the car ${flight.length.toFixed(
          0,
        )} m and it comes down ${flight.offRoad.toFixed(0)} m off the road — the road turns inside the flight`,
        at: flight.land,
        s: flight.lip.s,
        value: flight.offRoad - onRoad,
      });
    }

    if (flight.length > J.length.warn) {
      tooLong++;
      findings.push({
        code: "jumps.length",
        severity: flight.length > J.length.fail ? "error" : "warn",
        message: `a ${flight.length.toFixed(0)} m jump at ${(flight.speed * 3.6).toFixed(
          0,
        )} km/h — ${flight.air.toFixed(1)} s in the air`,
        at: { x: flight.lip.x, z: flight.lip.z },
        s: flight.lip.s,
        value: flight.length,
      });
    }
    if (flight.height > J.height.warn) {
      tooHigh++;
      findings.push({
        code: "jumps.height",
        severity: flight.height > J.height.fail ? "error" : "warn",
        message: `a jump puts ${flight.height.toFixed(1)} m of air under the car off a ${(
          (flight.pitch * 180) /
          Math.PI
        ).toFixed(0)}° ramp`,
        at: { x: flight.lip.x, z: flight.lip.z },
        s: flight.lip.s,
        value: flight.height,
      });
    }
    if (flight.impact > J.impact.warn) {
      tooHard++;
      findings.push({
        code: "jumps.impact",
        severity: flight.impact > J.impact.fail ? "error" : "warn",
        message: `the car comes down at ${flight.impact.toFixed(1)} m/s vertical`,
        at: flight.land,
        s: flight.lip.s,
        value: flight.impact,
      });
    }
    if (flight.struck > 0) {
      obstructed++;
      findings.push({
        code: "jumps.corridor",
        severity: "error",
        message: `${flight.struck} solid(s) stand in the flight path of a jump`,
        at: flight.land,
        s: flight.lip.s,
        value: flight.struck,
      });
    }
    // R6's own spacing, re-measured on the built stage rather than on the
    // plan the search validated.
    const gap = flight.lip.s - lastLip;
    if (gap < STAGE_RULES.jump.minSpacing) {
      tight++;
      findings.push({
        code: "jumps.spacing",
        severity: "warn",
        message: `two lips ${gap.toFixed(0)} m apart — R6 asks for ${STAGE_RULES.jump.minSpacing}`,
        at: { x: flight.lip.x, z: flight.lip.z },
        s: flight.lip.s,
        value: STAGE_RULES.jump.minSpacing - gap,
      });
    }
    lastLip = flight.lip.s;
  }

  const n = Math.max(1, flights.length);
  // A stage with no jumps on it fails nothing and proves nothing: the
  // checks all score 1 on an empty population, and the DENSITY note is
  // what says the vocabulary went quiet.
  const perKm = flights.length / Math.max(1, (track.finishS ?? track.length) / 1000);
  const checks: Check[] = [
    {
      id: "offroad",
      label: "every jump lands on the road",
      score: rate(landedOff, n),
      weight: 3,
      value: landedOff,
    },
    {
      id: "corridor",
      label: "nothing solid stands in a flight path",
      score: rate(obstructed, n),
      weight: 2,
      value: obstructed,
    },
    {
      id: "length",
      label: "a jump is a jump, not a launch",
      score: rate(tooLong, n),
      weight: 1.5,
      value: maxLength,
      budget: J.length.warn,
    },
    {
      id: "height",
      label: "the air under the car stays inside the feature",
      score: rate(tooHigh, n),
      weight: 1.5,
      value: maxHeight,
      budget: J.height.warn,
    },
    {
      id: "impact",
      label: "the car survives the landing",
      score: rate(tooHard, n),
      weight: 2,
      value: maxImpact,
      budget: J.impact.warn,
    },
    {
      id: "spacing",
      label: "lips keep R6's spacing",
      score: rate(tight, n),
      weight: 1,
      value: tight,
    },
    {
      id: "density",
      label: "the stage has jumps on it",
      score:
        flights.length === 0
          ? J.emptyScore
          : under(J.perKm.min - Math.min(J.perKm.min, perKm), 0, J.perKm.min),
      weight: 0.75,
      value: perKm,
      budget: J.perKm.min,
    },
  ];

  return {
    id: "jumps",
    label: "jumps",
    score: metricScore(checks),
    weight: ANALYSIS.weights.jumps,
    checks,
    findings,
    stats: {
      jumps: flights.length,
      perKm,
      maxLength,
      meanLength: flights.length > 0 ? sumLength / flights.length : 0,
      maxHeight,
      meanHeight: flights.length > 0 ? sumHeight / flights.length : 0,
      maxImpact,
      landedOff,
      obstructed,
    },
    ms: Date.now() - started,
  };
}
