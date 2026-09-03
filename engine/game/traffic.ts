// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R44 — THE TRAFFIC. The public roads the rally abandons still have people
// on them: somebody driving in from the edge of the map to park up and
// watch, somebody leaving town for wherever they were going before a rally
// shut the road. Leave the stage and you meet them — and you can hit them.
//
// A motorist is DELIBERATELY COARSE. They are not a car model: they are a
// point on a lane (`mapgen/traffic.ts` planned the lanes), moving at the
// posted limit, keeping their distance from whatever is ahead of them, and
// slowing for the bends. What makes them solid is that each one carries a
// real `CarState`, so the one contact solver the game has for two cars
// (`collideCars`) resolves the player against them exactly as it resolves
// the player against a rival: the impulse lands on both, the panels fold
// on both. What the motorist does with an impulse is the coarse half again
// — the shove carries them off the lane, and over the next second or two
// they settle back onto it, unless the hit was hard enough that they pull
// up for good and the traffic behind them queues.
//
// Everything here runs inside `step()`, off the state's own clock and its
// own seeded stream, so a run with traffic in it replays like one without.

import { createRng, type Rng } from "../lib/prng.ts";
import { clamp } from "../lib/math.ts";
import {
  planTraffic,
  type CarPark,
  type SpeedSign,
  type Spur,
  type Town,
  type TrafficRoute,
} from "../mapgen/index.ts";
import { collideCars } from "./collision.ts";
import { freshCar, freshStats } from "./car-state.ts";
import { TRAFFIC, TRAFFIC_MODELS } from "./defs/traffic.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarState, GameEvent, GameState, RunStats } from "./state.ts";

const T = TRAFFIC;

/** One motorist on the road. */
export type TrafficVehicle = {
  /** Stable for the vehicle's life — what the renderer keys its mesh by. */
  id: number;
  /** Index into `TRAFFIC_MODELS`. */
  model: number;
  /** Index into the fleet's routes, and how far along it, m. */
  route: number;
  s: number;
  /** The body: pose, velocity and the damage ledger the contact solver
   * writes. `u` is the speed the driver is holding. */
  car: CarState;
  spec: { mass: number };
  box: { halfLength: number; halfWidth: number };
  /** The driver's own share of the limit, 0..1. */
  cruise: number;
  /** Pulled up for good after a hit. */
  wrecked: boolean;
  /** At the end of the journey, waiting to be out of sight. */
  arrived: boolean;
  /** Seconds since the last contact — `Infinity` when settled on the
   * lane, which is what lets the pose be the lane's exactly. */
  jolt: number;
  /** Seconds spent arrived or wrecked with nobody watching. */
  unseen: number;
};

export type TrafficFleet = {
  routes: TrafficRoute[];
  signs: SpeedSign[];
  vehicles: TrafficVehicle[];
  /** Bumped every time the routes are rebuilt (endless: a new arm or car
   * park), so a reader holding meshes for the signs knows to rebuild. */
  version: number;
  /** How many vehicles the network is sized for. */
  target: number;
  /** Per route, the speed each point may be passed at, m/s: the posted
   * limit or the bend, whichever is lower. */
  caps: Float32Array[];
  rng: Rng;
  nextId: number;
  spawnClock: number;
  /** What the network was last planned from, to know when to replan. */
  spurCount: number;
  parkFirst: CarPark | null;
  parkCount: number;
  /** A fleet with no roads is a fleet that does nothing — every rival's
   * run, every test rig. */
  on: boolean;
};

/** Scratch for the motorist's side of a contact: their events and their
 * stats go nowhere, since nothing is listening for them. */
const THEIR_EVENTS: GameEvent[] = [];
let THEIR_STATS: RunStats | null = null;

/** Build the fleet for a stage. `on` false gives an empty fleet that costs
 * nothing per step. */
export function createTraffic(
  track: { spurs: readonly Spur[]; towns: readonly Town[] },
  carParks: readonly CarPark[],
  seed: number,
  on: boolean,
): TrafficFleet {
  const fleet: TrafficFleet = {
    routes: [],
    signs: [],
    vehicles: [],
    version: 0,
    target: 0,
    caps: [],
    rng: createRng((seed ^ 0x7a4f1c2b) >>> 0),
    nextId: 1,
    spawnClock: 0,
    spurCount: -1,
    parkFirst: null,
    parkCount: -1,
    on,
  };
  if (on) replan(fleet, track, carParks);
  return fleet;
}

/** Plan the routes afresh, and carry every vehicle whose journey still
 * exists across the rebuild by its route's key. */
function replan(
  fleet: TrafficFleet,
  track: { spurs: readonly Spur[]; towns: readonly Town[] },
  carParks: readonly CarPark[],
): void {
  const plan = planTraffic(track, carParks);
  const byKey = new Map<string, number>();
  plan.routes.forEach((route, i) => byKey.set(route.key, i));
  const kept: TrafficVehicle[] = [];
  for (const v of fleet.vehicles) {
    const route = byKey.get(fleet.routes[v.route].key);
    if (route === undefined) continue;
    v.route = route;
    kept.push(v);
  }
  fleet.vehicles = kept;
  fleet.routes = plan.routes;
  fleet.signs = plan.signs;
  fleet.caps = plan.routes.map(capsOf);
  fleet.target = Math.min(T.most, Math.round((plan.laneM / 1000) * T.perKm));
  fleet.version += 1;
  fleet.spurCount = track.spurs.length;
  fleet.parkFirst = carParks[0] ?? null;
  fleet.parkCount = carParks.length;
}

/** The speed each point of a route may be passed at: the posted limit,
 * or what holding `latAccel` through the bend there allows. */
function capsOf(route: TrafficRoute): Float32Array {
  const pts = route.points;
  const caps = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const turn = Math.abs(wrap(b.heading - a.heading));
    const run = Math.max(route.step, b.s - a.s);
    const curvature = turn / run;
    const bend = curvature > 1e-4 ? Math.sqrt(T.latAccel / curvature) : Infinity;
    caps[i] = Math.min(pts[i].limit, bend);
  }
  return caps;
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Drive the whole fleet one step, resolve the player against whoever is
 * near, and keep the road populated. The player's own events from any
 * contact go into `events`. */
export function stepTraffic(state: GameState, events: GameEvent[]): void {
  const fleet = state.traffic;
  if (!fleet.on) return;
  const carParks = state.terrain.carParks;
  if (
    fleet.spurCount !== state.track.spurs.length ||
    fleet.parkCount !== carParks.length ||
    fleet.parkFirst !== (carParks[0] ?? null)
  ) {
    replan(fleet, state.track, carParks);
  }
  const dt = TUNING.dt;
  const player = state.car;
  const vehicles = fleet.vehicles;
  for (const v of vehicles) drive(fleet, v, vehicles, player, dt);
  rubTraffic(state, events);
  // Out of sight is out of the world: a journey that ended somewhere the
  // player could see it waits until they cannot, and so does a wreck. But
  // only so many can wait — past `parked` of them the longest-standing one
  // goes whether it is watched or not, or a player who parks beside the
  // car park's gate would empty the road of everything else.
  let standing = 0;
  let oldest = -1;
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    if (!v.arrived && !v.wrecked) continue;
    const route = fleet.routes[v.route];
    const far =
      Math.hypot(v.car.x - player.x, v.car.z - player.z) > T.popClear || route.to === "map";
    v.unseen = far ? v.unseen + dt : 0;
    const linger = v.wrecked ? T.wreckLingers : 0;
    if (far && v.unseen >= linger) {
      vehicles.splice(i, 1);
      continue;
    }
    standing += 1;
    if (oldest < 0) oldest = i;
  }
  if (standing > T.parked && oldest >= 0) vehicles.splice(oldest, 1);
  fleet.spawnClock += dt;
  if (vehicles.length - standing < fleet.target && fleet.spawnClock >= T.spawnEvery) {
    fleet.spawnClock = 0;
    spawn(fleet, player);
  }
}

/** One motorist's step: read the road ahead, hold the speed it allows,
 * move along the lane, and settle back onto it if a hit took them off. */
function drive(
  fleet: TrafficFleet,
  v: TrafficVehicle,
  all: readonly TrafficVehicle[],
  player: CarState,
  dt: number,
): void {
  const route = fleet.routes[v.route];
  const pts = route.points;
  const car = v.car;
  const at = Math.min(pts.length - 1, Math.max(0, Math.round(v.s / route.step)));
  // What the road allows: the limit here, and the slowest bend inside the
  // distance a stop from this speed takes.
  let allowed = pts[at].limit * v.cruise;
  if (!v.arrived && !v.wrecked) {
    const reach = Math.ceil(((car.u * car.u) / (2 * T.brake) + 8) / route.step);
    const caps = fleet.caps[v.route];
    for (let i = at; i <= Math.min(pts.length - 1, at + reach); i++) {
      if (caps[i] < allowed) allowed = caps[i];
    }
    // ...and whatever is in the lane ahead: another motorist, or the
    // player. The gap is held as a time headway over a standing gap, so a
    // queue forms at a walking pace and stops short of a touch.
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    for (let i = 0; i <= all.length; i++) {
      const other = i === all.length ? player : all[i].car;
      if (other === car) continue;
      const box = i === all.length ? PLAYER_BOX : all[i].box;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * sinH + dz * cosH;
      if (along <= 0 || along > T.look) continue;
      const across = Math.abs(dx * cosH - dz * sinH);
      const facing = Math.sin(other.heading) * sinH + Math.cos(other.heading) * cosH;
      if (facing < -0.5) {
        // Oncoming. Their own lane is beside this one, and on a narrow
        // lane that is within a mirror's width — so only a car actually
        // in THIS lane's path is anything to stop for.
        if (across > (v.box.halfWidth + box.halfWidth) * 0.5) continue;
      } else {
        // In the lane, or so close ahead and beside — a lane feeding in
        // at a turning — that the driver gives way anyway.
        const near = along < 12 && across < 6;
        if (across > T.laneHalf + box.halfWidth && !near) continue;
      }
      const gap = along - v.box.halfLength - box.halfLength;
      const theirs = other.u * facing;
      const keep = Math.max(0, (gap - T.gap.stand) / T.gap.headway + Math.max(0, theirs));
      if (keep < allowed) allowed = keep;
    }
  } else {
    allowed = 0;
  }
  // The pedals: a steady pull-away, an ordinary stop, and a hard one when
  // the road ahead has closed up faster than an ordinary stop can answer.
  const want = allowed - car.u;
  const decel = want < -car.u * 0.5 ? T.panic : T.brake;
  car.u += clamp(want, -decel * dt, T.accel * dt);
  v.s = Math.max(0, v.s + car.u * dt);
  if (v.s >= route.length) {
    v.s = route.length;
    v.arrived = true;
    car.u = 0;
  }
  const lane = laneAt(route, v.s);
  if (v.jolt === Infinity) {
    // Settled: the pose IS the lane's.
    car.x = lane.x;
    car.z = lane.z;
    car.y = lane.y;
    car.heading = lane.heading;
    car.w = 0;
    car.yawRate = 0;
    return;
  }
  // Knocked off the lane: the body goes where the hit sent it, the slide
  // and the spin bleed off, and the driver steers back onto the lane.
  v.jolt += dt;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  car.x += (car.u * sinH + car.w * cosH) * dt;
  car.z += (car.u * cosH - car.w * sinH) * dt;
  car.w *= Math.exp(-dt / T.settle.slide);
  car.yawRate *= Math.exp(-dt / T.settle.spin);
  car.heading += car.yawRate * dt;
  car.heading += wrap(lane.heading - car.heading) * Math.min(1, dt / T.settle.heading);
  const pull = Math.min(1, dt / T.settle.lane);
  car.x += (lane.x - car.x) * pull;
  car.z += (lane.z - car.z) * pull;
  car.y = lane.y;
  const off = Math.hypot(lane.x - car.x, lane.z - car.z);
  if (off < 0.05 && Math.abs(wrap(lane.heading - car.heading)) < 0.01 && Math.abs(car.w) < 0.05) {
    v.jolt = Infinity;
  }
}

const PLAYER_BOX = {
  halfLength: TUNING.collision.halfLength,
  halfWidth: TUNING.collision.halfWidth,
};

const LANE = { x: 0, z: 0, y: 0, heading: 0 };

/** The lane's pose at arc position `s`, between its samples. One shared
 * object: the caller reads it before anything else asks. */
function laneAt(route: TrafficRoute, s: number): typeof LANE {
  const pts = route.points;
  const f = Math.max(0, Math.min(pts.length - 1, s / route.step));
  const i = Math.floor(f);
  const a = pts[i];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const t = f - i;
  LANE.x = a.x + (b.x - a.x) * t;
  LANE.z = a.z + (b.z - a.z) * t;
  LANE.y = a.y + (b.y - a.y) * t;
  LANE.heading = a.heading + wrap(b.heading - a.heading) * t;
  return LANE;
}

/** How near a motorist has to be to be asked about, m, either axis. */
const RUB_RANGE = 24;

/** The player against every motorist within reach — both halves of each
 * contact land, and a hit that changes a motorist's velocity by more than
 * `wreckSpeed` ends their journey where they stand. */
function rubTraffic(state: GameState, events: GameEvent[]): void {
  if (state.phase !== "racing" && state.phase !== "rollout") return;
  const player = state.car;
  THEIR_STATS ??= freshStats();
  for (const v of state.traffic.vehicles) {
    const them = v.car;
    if (Math.abs(them.x - player.x) > RUB_RANGE) continue;
    if (Math.abs(them.z - player.z) > RUB_RANGE) continue;
    const u0 = them.u;
    const w0 = them.w;
    const met = collideCars(
      { spec: state.spec, car: player, events, stats: state.stats },
      { spec: v.spec, car: them, events: THEIR_EVENTS, stats: THEIR_STATS, box: v.box },
    );
    THEIR_EVENTS.length = 0;
    if (!met) continue;
    v.jolt = Math.min(v.jolt, 0);
    if (Math.hypot(them.u - u0, them.w - w0) > T.wreckSpeed) v.wrecked = true;
  }
}

/** Put one more motorist on the road, if there is a route whose start is
 * clear and out of the player's sight. */
function spawn(fleet: TrafficFleet, player: CarState): void {
  const routes = fleet.routes;
  if (routes.length === 0) return;
  let total = 0;
  for (const route of routes) total += route.weight;
  let pick = fleet.rng.next() * total;
  let chosen = routes.length - 1;
  for (let i = 0; i < routes.length; i++) {
    pick -= routes[i].weight;
    if (pick < 0) {
      chosen = i;
      break;
    }
  }
  const route = routes[chosen];
  const start = route.points[0];
  if (route.from !== "map" && Math.hypot(start.x - player.x, start.z - player.z) < T.popClear) {
    return;
  }
  for (const v of fleet.vehicles) {
    if (Math.hypot(v.car.x - start.x, v.car.z - start.z) < T.spawnClear) return;
  }
  let weight = 0;
  for (const m of TRAFFIC_MODELS) weight += m.weight;
  let roll = fleet.rng.next() * weight;
  let model = TRAFFIC_MODELS.length - 1;
  for (let i = 0; i < TRAFFIC_MODELS.length; i++) {
    roll -= TRAFFIC_MODELS[i].weight;
    if (roll < 0) {
      model = i;
      break;
    }
  }
  const m = TRAFFIC_MODELS[model];
  const car = freshCar();
  car.x = start.x;
  car.z = start.z;
  car.y = start.y;
  car.heading = start.heading;
  // In from the edge of the map at speed; away from a place at a standstill.
  car.u = route.from === "map" ? Math.min(fleet.caps[chosen][0], start.limit * m.cruise) : 0;
  fleet.vehicles.push({
    id: fleet.nextId++,
    model,
    route: chosen,
    s: 0,
    car,
    spec: { mass: m.mass },
    box: { halfLength: m.length / 2, halfWidth: m.width / 2 },
    cruise: m.cruise,
    wrecked: false,
    arrived: false,
    jolt: Infinity,
    unseen: 0,
  });
}
