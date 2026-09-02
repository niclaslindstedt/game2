// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R41 — THE RAILWAY, and the train on it.
//
// A railway is laid the way the tarmac is (R17): across the map, edge to
// edge, on nothing but the seed and the bare country, BEFORE the rally is
// routed — so the route plans around it and, where it has to get past,
// crosses it SQUARE (R36's solve, `crossing.ts`). It is a `Highway` of kind
// `rail` in the same network as the public roads, which is what makes every
// clearance the search keeps from a road hold against the line for free.
// What differs is what may be done with it: nobody borrows a railway, no
// junction joins one, and the crossing is not a formation the gravel climbs
// onto but a RAMP built beside the line — a proper lip, high enough that a
// car taking it at pace flies over the train.
//
// What this module owns is everything the crossing needs once it exists:
// the record the compiler writes for it (`RailCrossing`), the LINE the train
// runs on (the two arms cut from the railway, joined through the crossing
// into one walk), the timetable, and the train as the physics meets it — a
// run of solids standing on the rails wherever the train is at this second.
// The train is a pure function of the stage's clock: nothing about it is
// state, so a run is deterministic in its seed without a byte of it being
// stepped, and the renderer asks the same function for the same answer.
//
// Nothing here knows what a wagon looks like. The consist is a list of
// lengths; the app dresses them.

import { cellKey } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { RAILCAR, standSolid, type WildObstacle } from "./solids.ts";
import type { Spur, SpurSample } from "./spurs.ts";

/** One vehicle of the consist, m: how long it is over the buffers, and
 * which kind the app dresses it as. The locomotive leads. */
export type TrainCar = { kind: "loco" | "railbus" | "timber" | "box" | "tank"; length: number };

/** R41 — the TIMETABLE: when the trains come, which way, and how fast. */
export type TrainSchedule = {
  /** Seconds of stage clock at which the head of the FIRST train reaches
   * the crossing point. Set against a driver's likely arrival — a train
   * that always went through the night before is a railway with no train
   * on it. */
  first: number;
  /** Seconds between one train's head reaching the crossing and the
   * next's. */
  period: number;
  /** Speed along the line, m/s. */
  speed: number;
  /** +1 runs from the entry arm's far end toward the exit arm's; -1 the
   * other way. Alternates train by train, the way a single line is worked. */
  direction: 1 | -1;
  cars: TrainCar[];
};

/** R41 — one place the rally crosses the railway. */
export type RailCrossing = {
  /** The crossing point: on the route's centerline, on the rails. */
  x: number;
  z: number;
  /** The route's own height there — the rails are laid flush with it. */
  y: number;
  /** The railway's heading through the crossing. */
  heading: number;
  /** Arc position on the stage. */
  s: number;
  /** Which line of `track.highways`, and which point of it. */
  road: number;
  index: number;
  /** Arc position of the ramp's lip on the stage — `s` less the gap the
   * ramp keeps back from the rails. */
  lipS: number;
  schedule: TrainSchedule;
  /** The line the train runs: the entry arm reversed, the crossing, the
   * exit arm — one walk, `s` from the entry arm's far end. Empty until the
   * arms are cut (`compile.ts`'s fork pass fills it). */
  line: RailLine;
};

export type RailLine = {
  samples: SpurSample[];
  /** Total length, m. */
  length: number;
  /** Arc position of the crossing point along the line. */
  crossingS: number;
  /** Cells of `LINE_CELL` metres → sample indices, so a contact query can
   * find the piece of line under the car without walking all of it. */
  cells: Map<number, number[]>;
};

/** Cell edge of the line's lookup grid, m. */
const LINE_CELL = 32;

const RAILCAR_HALF = RAILCAR.half;
const RAILCAR_BAY = RAILCAR.bay;

/** R41 — the LINE, from the two arms the compiler cut. Entry arm reversed
 * so the walk runs one way through the crossing. Both arms start at the
 * crossing point, so the joint is where `s === crossingS`. */
export function joinRailLine(entry: Spur, exit: Spur): RailLine {
  const samples: SpurSample[] = [];
  const back = entry.samples;
  // The entry arm's samples run outward from the crossing; reversed they
  // run inward, and their headings turn about-face so the walk's heading
  // is the direction of travel along it.
  for (let i = back.length - 1; i >= 1; i--) {
    const p = back[i];
    samples.push({ ...p, heading: p.heading + Math.PI });
  }
  for (const p of exit.samples) samples.push({ ...p });
  // Re-walk the arc: each arm's own `s` was measured from the crossing.
  let s = 0;
  for (let i = 0; i < samples.length; i++) {
    if (i > 0) {
      const a = samples[i - 1];
      s += Math.hypot(samples[i].x - a.x, samples[i].z - a.z);
    }
    samples[i].s = s;
  }
  const crossingS = samples.length > 0 ? samples[Math.max(0, back.length - 1)].s : 0;
  const cells = new Map<number, number[]>();
  for (let i = 0; i < samples.length; i++) {
    const key = cellKey(Math.floor(samples[i].x / LINE_CELL), Math.floor(samples[i].z / LINE_CELL));
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  }
  return { samples, length: s, crossingS, cells };
}

/** R41 — draw a timetable for a crossing. `arriveS` is the crossing's arc
 * position on the stage, from which a driver's likely arrival is guessed
 * at the pace the rule names; the first train is timed around it, and the
 * rest follow at the period. Deterministic in the seed and the crossing. */
export function drawSchedule(seed: number, ordinal: number, arriveS: number): TrainSchedule {
  const T = R.rail.train;
  const rng = createRng((seed ^ 0x7ad1c3e5 ^ Math.imul(ordinal + 1, 0x9e3779b9)) >>> 0);
  const cars: TrainCar[] = [];
  // A railbus runs alone; a freight is a locomotive and its wagons, of one
  // kind per train the way a timber train or a tank train is made up.
  if (rng.chance(T.railbus)) {
    cars.push({ kind: "railbus", length: T.length.railbus });
    if (rng.chance(0.4)) cars.push({ kind: "railbus", length: T.length.railbus });
  } else {
    cars.push({ kind: "loco", length: T.length.loco });
    const wagon = rng.next();
    const kind: TrainCar["kind"] = wagon < 0.5 ? "timber" : wagon < 0.8 ? "box" : "tank";
    const count = Math.round(rng.range(T.wagons.min, T.wagons.max));
    for (let i = 0; i < count; i++) cars.push({ kind, length: T.length[kind] });
  }
  const arrival = arriveS / T.pace;
  return {
    first: Math.max(8, arrival + rng.range(T.lead.min, T.lead.max)),
    period: rng.range(T.period.min, T.period.max),
    speed: rng.range(T.speed.min, T.speed.max),
    direction: rng.chance(0.5) ? 1 : -1,
    cars,
  };
}

/** Where the train's HEAD is along the line at stage time `t`, and which
 * way it is going — or null while no train is on the line. The n-th train
 * reaches the crossing at `first + n·period`, alternating direction.
 *
 * A train is on the line only within `train.reach` of the crossing: it
 * comes out of the fog at one end of that and goes back into it at the
 * other. The line runs to the edge of the map, kilometres each way, and a
 * train that ran the whole of it would still be on it when the next was
 * due — a single line worked that way has two trains on it pointing at each
 * other. `period.min` is held over the reach's transit by `rules_test`, so
 * there is never more than one. */
export function trainAt(
  crossing: RailCrossing,
  t: number,
): { headS: number; direction: 1 | -1; speed: number } | null {
  const { schedule, line } = crossing;
  if (line.samples.length === 0) return null;
  const trainLength = schedule.cars.reduce((sum, car) => sum + car.length, 0);
  const reach = R.rail.train.reach;
  // Which train could be on the line now: the one whose head passed the
  // crossing within the reach's own transit, either way.
  const window = (reach + trainLength) / schedule.speed;
  const from = Math.floor((t - window - schedule.first) / schedule.period);
  const to = Math.ceil((t + window - schedule.first) / schedule.period);
  for (let n = Math.max(0, from); n <= to; n++) {
    const passes = schedule.first + n * schedule.period;
    const direction: 1 | -1 = n % 2 === 0 ? schedule.direction : (-schedule.direction as 1 | -1);
    // Head position along the line, measured in the direction of travel
    // from the crossing.
    const ahead = (t - passes) * schedule.speed;
    const headS = line.crossingS + direction * ahead;
    const tailS = headS - direction * trainLength;
    const lo = Math.min(headS, tailS);
    const hi = Math.max(headS, tailS);
    if (
      hi < Math.max(0, line.crossingS - reach) ||
      lo > Math.min(line.length, line.crossingS + reach)
    ) {
      continue;
    }
    return { headS, direction, speed: schedule.speed };
  }
  return null;
}

/** The sample of a line at arc position `s` (clamped), interpolated. */
export function lineAt(
  line: RailLine,
  s: number,
): { x: number; z: number; y: number; heading: number } {
  const { samples } = line;
  if (samples.length === 1) {
    const p = samples[0];
    return { x: p.x, z: p.z, y: p.elevation, heading: p.heading };
  }
  const clamped = Math.max(0, Math.min(line.length, s));
  // Samples are `SPUR.step` apart to within the join; a guess and a local
  // walk lands on the right pair without a search over the whole line.
  let i = Math.min(
    samples.length - 2,
    Math.max(0, Math.floor((clamped / line.length) * (samples.length - 1))),
  );
  while (i > 0 && samples[i].s > clamped) i--;
  while (i < samples.length - 2 && samples[i + 1].s < clamped) i++;
  const a = samples[i];
  const b = samples[i + 1];
  const run = b.s - a.s;
  const u = run > 1e-6 ? (clamped - a.s) / run : 0;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    y: a.elevation + (b.elevation - a.elevation) * u,
    heading: a.heading,
  };
}

/** Every vehicle of the train at time `t`: where its centre is on the line
 * and which way it points. Empty when no train is on it. The app poses its
 * meshes from this; the contact model stands solids on it. */
export function trainCars(
  crossing: RailCrossing,
  t: number,
): { car: TrainCar; s: number; direction: 1 | -1; speed: number }[] {
  const at = trainAt(crossing, t);
  if (!at) return [];
  const out: { car: TrainCar; s: number; direction: 1 | -1; speed: number }[] = [];
  let s = at.headS;
  for (const car of crossing.schedule.cars) {
    const centre = s - (at.direction * car.length) / 2;
    out.push({ car, s: centre, direction: at.direction, speed: at.speed });
    s -= at.direction * car.length;
  }
  return out;
}

/** R41 — THE TRAIN AS THE CAR MEETS IT: the solids standing on the rails
 * within `r` of a point at time `t`. A run of circles down each vehicle's
 * length, footed on the rails, as tall as the train, moving at the train's
 * own speed — so a car that arrives under one is hit by a moving wall, and
 * one in the air above it is not (the contact model's height gate).
 *
 * Only the piece of line under the car is looked at: the line's cell index
 * says which samples are near, and only a vehicle spanning them stands any
 * solids. Nothing to pay when the car is nowhere near the rails, which is
 * nearly always. */
export function trainSolidsNear(
  crossing: RailCrossing,
  t: number,
  x: number,
  z: number,
  r: number,
): WildObstacle[] {
  const { line } = crossing;
  if (line.samples.length === 0) return [];
  // The nearest line sample to the point, from the cells around it.
  const reach = Math.ceil((r + RAILCAR_HALF + 2) / LINE_CELL);
  const cx = Math.floor(x / LINE_CELL);
  const cz = Math.floor(z / LINE_CELL);
  let nearS = -1;
  let nearD = Infinity;
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const bucket = line.cells.get(cellKey(cx + dx, cz + dz));
      if (!bucket) continue;
      for (const i of bucket) {
        const p = line.samples[i];
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < nearD) {
          nearD = d;
          nearS = p.s;
        }
      }
    }
  }
  if (nearS < 0 || nearD > r + RAILCAR_HALF + 4) return [];
  const cars = trainCars(crossing, t);
  if (cars.length === 0) return [];
  const out: WildObstacle[] = [];
  for (const { car, s, direction, speed } of cars) {
    const half = car.length / 2;
    if (nearS < s - half - r - RAILCAR_HALF || nearS > s + half + r + RAILCAR_HALF) continue;
    // Bays down the vehicle, from its front, and only the bays within reach
    // of the point.
    const bays = Math.max(1, Math.ceil(car.length / RAILCAR_BAY));
    for (let k = 0; k <= bays; k++) {
      const along = s - half + (car.length * k) / bays;
      if (Math.abs(along - nearS) > r + RAILCAR_HALF + RAILCAR_BAY) continue;
      const at = lineAt(line, along);
      const vx = Math.sin(at.heading) * speed * direction;
      const vz = Math.cos(at.heading) * speed * direction;
      out.push({
        ...standSolid({ x: at.x, z: at.z, y: at.y, kind: "railcar", size: 1, spin: at.heading }),
        vx,
        vz,
      });
    }
  }
  return out;
}
