// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R44 — THE TRAFFIC on the public roads. The routes are planned over the
// arms the rally abandons and the lanes into the car parks; the fleet
// drives them at the posted limit, keeps its distance, and can be hit.
// These are the claims: a route is a lane on the driver's side of a real
// road, the signs post what the lanes are driven at, the motorists stay
// on their lanes and under their limits, a queue forms behind the player
// without a touch, a hit lands on both, and all of it replays.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  STAGE_RULES,
  TRAFFIC,
  TRAFFIC_LIMITS,
  TRAFFIC_MODELS,
  TUNING,
  botInput,
  compileStage,
  createGame,
  createTerrain,
  planTraffic,
  step,
  type GameState,
  type TrafficPlan,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 42, 55, 77, 89];

const plans = new Map<number, TrafficPlan>();

/** The plan for a seed, built once. */
function planFor(seed: number): TrafficPlan {
  let plan = plans.get(seed);
  if (!plan) {
    const track = compileStage(seed, "medium", { asphalt: 0.6 });
    plan = planTraffic(track, createTerrain(track).carParks);
    plans.set(seed, plan);
  }
  return plan;
}

/** A seed whose roads carry traffic — searched, never pinned, so a change
 * to where the route meets the tarmac cannot fail this file for a reason
 * that has nothing to do with the traffic. */
function busySeed(): number {
  for (const seed of SEEDS) if (planFor(seed).routes.length > 0) return seed;
  throw new Error("no seed in the sweep has a public road with traffic on it");
}

function game(seed: number, traffic = true): GameState {
  return createGame({ seed, length: "medium", knobs: { asphalt: 0.6 }, quiet: true, traffic });
}

function run(state: GameState, seconds: number): void {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) step(state, NEUTRAL_INPUT);
}

describe("the routes (R44)", () => {
  it("run between the places a public road reaches, at the plan's spacing", () => {
    const plan = planFor(busySeed());
    for (const route of plan.routes) {
      expect(["map", "block", "town", "park"]).toContain(route.from);
      expect(["map", "block", "town", "park"]).toContain(route.to);
      expect(route.weight).toBeGreaterThan(0);
      expect(route.weight).toBeLessThanOrEqual(1);
      expect(route.step).toBe(STAGE_RULES.traffic.step);
      expect(route.points.length).toBeGreaterThan(2);
      expect(route.length).toBeCloseTo(route.points[route.points.length - 1].s, 6);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1];
        const b = route.points[i];
        expect(b.s - a.s).toBeCloseTo(route.step, 6);
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(route.step * 1.01);
        expect(b.limit).toBeGreaterThan(0);
      }
    }
  });

  it("keep to the driver's right of the arm's centerline", () => {
    const seed = busySeed();
    const track = compileStage(seed, "medium", { asphalt: 0.6 });
    const plan = planFor(seed);
    const arms = track.spurs.filter((s) => !s.rail && s.block);
    let checked = 0;
    for (const route of plan.routes) {
      // A journey between the tape and the edge of the map lies on one arm
      // from end to end; the others turn off it somewhere.
      if (route.to !== "map" || (route.from !== "block" && route.from !== "town")) continue;
      for (const p of route.points) {
        if (p.s < 20 || p.s > route.length - 20) continue;
        let best = Infinity;
        let near = arms[0].samples[0];
        for (const arm of arms) {
          for (const q of arm.samples) {
            const d = Math.hypot(q.x - p.x, q.z - p.z);
            if (d < best) {
              best = d;
              near = q;
            }
          }
        }
        const arm = arms.find((a) => a.samples.includes(near));
        if (!arm) throw new Error("a route point off every arm");
        // A quarter of the road off the centerline, on the right of the
        // way the route is going — which is the arm's own right where the
        // route runs the arm outward, and its left where it runs it back.
        expect(best).toBeCloseTo(arm.width / 4, 0);
        const along = Math.cos(p.heading - near.heading);
        const lateral =
          (p.x - near.x) * Math.cos(near.heading) - (p.z - near.z) * Math.sin(near.heading);
        expect(Math.abs(along)).toBeGreaterThan(0.9);
        expect(Math.sign(lateral)).toBe(Math.sign(along));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("post the limits they are driven at", () => {
    const plan = planFor(busySeed());
    const posted = new Set(plan.signs.map((s) => s.limit));
    for (const limit of posted) {
      expect(Object.values(TRAFFIC_LIMITS)).toContain(limit);
    }
    expect(posted.has(TRAFFIC_LIMITS.country)).toBe(true);
    const driven = new Set<number>();
    for (const route of plan.routes) {
      for (const p of route.points) driven.add(Math.round(p.limit * 3.6));
    }
    for (const limit of driven) expect(posted.has(limit)).toBe(true);
  });

  it("are the same plan every time", () => {
    const seed = busySeed();
    const track = compileStage(seed, "medium", { asphalt: 0.6 });
    const a = planTraffic(track, createTerrain(track).carParks);
    const b = planTraffic(track, createTerrain(track).carParks);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("the fleet", () => {
  it("is the roster, and the roster is twenty", () => {
    expect(TRAFFIC_MODELS.length).toBe(20);
    const ids = new Set(TRAFFIC_MODELS.map((m) => m.id));
    expect(ids.size).toBe(20);
    for (const m of TRAFFIC_MODELS) {
      expect(m.cruise).toBeLessThanOrEqual(1);
      expect(m.length).toBeGreaterThan(m.width);
      expect(m.mass).toBeGreaterThan(0);
    }
  });

  it("populates the roads, on the lanes and under the limit", () => {
    const state = game(busySeed());
    run(state, 40);
    const fleet = state.traffic;
    expect(fleet.target).toBeGreaterThan(0);
    expect(fleet.vehicles.length).toBeGreaterThan(0);
    expect(fleet.vehicles.length).toBeLessThanOrEqual(fleet.target);
    for (const v of fleet.vehicles) {
      const route = fleet.routes[v.route];
      expect(v.s).toBeLessThanOrEqual(route.length);
      const i = Math.min(route.points.length - 1, Math.round(v.s / route.step));
      const p = route.points[i];
      expect(Math.hypot(v.car.x - p.x, v.car.z - p.z)).toBeLessThan(route.step);
      expect(v.car.u).toBeLessThanOrEqual(p.limit * v.cruise + 0.01);
      expect(v.car.u).toBeGreaterThanOrEqual(0);
    }
  });

  it("is off for a run that says so", () => {
    const state = game(busySeed(), false);
    run(state, 5);
    expect(state.traffic.routes.length).toBe(0);
    expect(state.traffic.vehicles.length).toBe(0);
  });

  it("changes nothing about how the stage itself is driven", () => {
    // The fleet draws from its own stream and the bot never leaves the
    // stage, so the sim table is the same table with the traffic on.
    const seed = busySeed();
    const on = game(seed);
    const off = game(seed, false);
    for (let i = 0; i < 40 * TUNING.physicsHz; i++) {
      step(on, botInput(on));
      step(off, botInput(off));
    }
    expect(on.traffic.vehicles.length).toBeGreaterThan(0);
    expect([on.car.x, on.car.z, on.car.u, on.progressS]).toEqual([
      off.car.x,
      off.car.z,
      off.car.u,
      off.progressS,
    ]);
  });

  it("replays exactly", () => {
    const seed = busySeed();
    const a = game(seed);
    const b = game(seed);
    run(a, 30);
    run(b, 30);
    const pose = (s: GameState): string =>
      JSON.stringify(
        s.traffic.vehicles.map((v) => [v.id, v.model, v.route, v.s, v.car.x, v.car.z]),
      );
    expect(a.traffic.vehicles.length).toBeGreaterThan(0);
    expect(pose(a)).toBe(pose(b));
  });
});

/** Stand the player on a lane, stopped, `ahead` metres up the road from
 * a fresh motorist driving toward them. */
function stage(ahead: number): { state: GameState; vehicle: number } {
  const state = game(busySeed());
  state.phase = "racing";
  run(state, 20);
  const fleet = state.traffic;
  // The motorist with the most road still to drive.
  let pick = -1;
  let most = 0;
  fleet.vehicles.forEach((v, i) => {
    const left = fleet.routes[v.route].length - v.s;
    if (!v.arrived && !v.wrecked && v.jolt === Infinity && left > most) {
      most = left;
      pick = i;
    }
  });
  expect(pick).toBeGreaterThanOrEqual(0);
  const v = fleet.vehicles[pick];
  const route = fleet.routes[v.route];
  const at =
    route.points[Math.min(route.points.length - 1, Math.round((v.s + ahead) / route.step))];
  state.car.x = at.x;
  state.car.z = at.z;
  state.car.y = at.y;
  state.car.heading = at.heading;
  state.car.u = 0;
  state.car.w = 0;
  return { state, vehicle: v.id };
}

describe("the motorist", () => {
  it("queues behind the player without touching them", () => {
    const { state, vehicle } = stage(60);
    const before = state.stats.impacts;
    const px = state.car.x;
    const pz = state.car.z;
    let closest = Infinity;
    for (let i = 0; i < 12 * TUNING.physicsHz; i++) {
      state.car.x = px;
      state.car.z = pz;
      state.car.u = 0;
      step(state, NEUTRAL_INPUT);
      const v = state.traffic.vehicles.find((c) => c.id === vehicle);
      if (!v) break;
      closest = Math.min(closest, Math.hypot(v.car.x - px, v.car.z - pz));
    }
    const v = state.traffic.vehicles.find((c) => c.id === vehicle);
    expect(v).toBeDefined();
    expect(v?.car.u).toBeLessThan(0.5);
    expect(closest).toBeGreaterThan(TUNING.collision.halfLength + (v?.box.halfLength ?? 0));
    expect(state.stats.impacts).toBe(before);
  });

  it("is shoved by a hit, and both sides pay for it", () => {
    const { state, vehicle } = stage(8);
    // Turn round and drive into them.
    state.car.heading += Math.PI;
    state.car.u = 18;
    const before = state.stats.impacts;
    let met = false;
    let wrecked = false;
    for (let i = 0; i < 3 * TUNING.physicsHz; i++) {
      const events = step(state, NEUTRAL_INPUT);
      if (events.some((e) => e.type === "impact")) met = true;
      const v = state.traffic.vehicles.find((c) => c.id === vehicle);
      if (v?.wrecked) wrecked = true;
    }
    expect(met).toBe(true);
    expect(state.stats.impacts).toBeGreaterThan(before);
    expect(wrecked).toBe(true);
    const v = state.traffic.vehicles.find((c) => c.id === vehicle);
    expect(v).toBeDefined();
    let folded = 0;
    for (const zone of v?.car.damage.zones ?? []) folded += zone;
    expect(folded).toBeGreaterThan(0);
  });

  it("drives the limit on the open road", () => {
    const state = game(busySeed());
    run(state, 60);
    let cruising = 0;
    for (const v of state.traffic.vehicles) {
      const route = state.traffic.routes[v.route];
      const i = Math.min(route.points.length - 1, Math.round(v.s / route.step));
      const p = route.points[i];
      if (v.car.u > p.limit * v.cruise * 0.97) cruising += 1;
    }
    expect(cruising).toBeGreaterThan(0);
    expect(TRAFFIC.perKm).toBeGreaterThan(0);
  });
});
