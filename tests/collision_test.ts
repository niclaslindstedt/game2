// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The contact model: the car as an oriented box against the wild's circular
// solids — the impulse that bounces and scrapes, the yaw kick that spins a
// clipped car, the crush that bends the body and tears parts off, and the
// wear that eventually wrecks the chassis. Plus the forest's trunk field:
// deterministic, dense where the groves are, and never on the road.

import { describe, expect, it } from "vitest";

import {
  DAMAGE_ZONES,
  NEUTRAL_INPUT,
  TUNING,
  collideCar,
  compileTrack,
  createGame,
  createTerrain,
  damageZoneAt,
  step,
  type GameEvent,
  type GameState,
  type WildObstacle,
} from "@engine";

const LONG_STRAIGHT = [{ kind: "straight", length: 9000, feature: "none" } as const];

function freshState(): GameState {
  return createGame({ seed: 3, skipCountdown: true, track: compileTrack(3, LONG_STRAIGHT) });
}

function solid(overrides: Partial<WildObstacle> = {}): WildObstacle {
  return {
    x: 0,
    z: 0,
    y: 0,
    kind: "boulder",
    size: 1,
    spin: 0,
    radius: 1,
    height: 2,
    ...overrides,
  };
}

describe("damage zones", () => {
  it("maps impact angles onto the eight body zones", () => {
    expect(damageZoneAt(0)).toBe(0); // nose
    expect(damageZoneAt(Math.PI / 2)).toBe(2); // right flank
    expect(damageZoneAt(Math.PI)).toBe(4); // tail
    expect(damageZoneAt(-Math.PI / 2)).toBe(6); // left flank
    expect(damageZoneAt(Math.PI / 4)).toBe(1); // front-right corner
    expect(DAMAGE_ZONES).toBe(8);
  });
});

describe("the impulse", () => {
  it("a head-on hit folds the nose, kills the pace, and tears the bumper off", () => {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    const events: GameEvent[] = [];
    // The trunk dead ahead, just inside the nose.
    const tree = solid({ kind: "tree", z: car.z + TUNING.collision.halfLength + 0.5, x: car.x });
    const before = car.z;
    collideCar(car, [tree], events, state.stats);

    expect(car.u).toBeLessThan(1); // restitution only bounces a fraction back
    expect(car.z).toBeLessThan(before); // pushed back out of the trunk
    expect(car.damage.zones[0]).toBeGreaterThan(0.2);
    expect(car.damage.wear).toBeGreaterThan(0.3);
    expect(car.damage.broken).toContain("bumperF");
    expect(car.damage.version).toBe(1);
    const impact = events.find((e) => e.type === "impact");
    expect(impact).toBeDefined();
    if (impact?.type === "impact") {
      expect(impact.speed).toBeCloseTo(30, 0);
      expect(Math.abs(impact.angle)).toBeLessThan(0.3);
    }
    expect(state.stats.impacts).toBe(1);
  });

  it("a glancing scrape deflects and spins the car, keeping most speed", () => {
    const state = freshState();
    const car = state.car;
    car.u = 25;
    car.w = 4; // drifting slightly into the trunk, flank first
    const events: GameEvent[] = [];
    const tree = solid({
      kind: "tree",
      x: car.x + TUNING.collision.halfWidth + 0.2,
      z: car.z,
      radius: 0.4,
    });
    collideCar(car, [tree], events, state.stats);

    expect(car.yawRate).not.toBe(0); // the lever arm turned the drag into spin
    expect(car.x).toBeLessThan(0); // pushed back off the trunk
    expect(car.u).toBeGreaterThan(15); // a scrape, not a wall
    const impact = events.find((e) => e.type === "impact");
    expect(impact).toBeDefined();
    if (impact?.type === "impact") expect(impact.angle).toBeGreaterThan(0); // right side
  });

  it("a side scrape pops the mirror but leaves the bumpers on", () => {
    const state = freshState();
    const car = state.car;
    car.u = 0;
    car.w = 9; // sliding right, flank first
    const events: GameEvent[] = [];
    const tree = solid({ kind: "tree", x: car.x + TUNING.collision.halfWidth + 0.2, radius: 0.4 });
    collideCar(car, [tree], events, state.stats);

    expect(car.damage.broken).toContain("mirrorR");
    expect(car.damage.broken).not.toContain("bumperF");
    expect(car.damage.broken).not.toContain("bumperR");
  });

  it("a part breaks once — further hits on the same zone stay silent", () => {
    const state = freshState();
    const car = state.car;
    const events: GameEvent[] = [];
    const tree = solid({ kind: "tree", z: car.z + TUNING.collision.halfLength + 0.5 });
    car.u = 30;
    collideCar(car, [tree], events, state.stats);
    car.u = 30;
    car.z = 0;
    collideCar(car, [tree], events, state.stats);
    expect(events.filter((e) => e.type === "partBreak" && e.part === "bumperF")).toHaveLength(1);
  });

  it("a flight clears anything it is higher than", () => {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    car.y = 1.2;
    car.airborne = true;
    const events: GameEvent[] = [];
    const log = solid({ kind: "log", z: car.z + 1, height: 0.75 });
    collideCar(car, [log], events, state.stats);
    expect(car.u).toBe(30);
    expect(events).toHaveLength(0);
  });

  it("below the scuff floor a contact stops the car without marking it", () => {
    const state = freshState();
    const car = state.car;
    car.u = TUNING.collision.scuffSpeed - 0.5;
    const events: GameEvent[] = [];
    const rock = solid({ z: car.z + TUNING.collision.halfLength + 0.5 });
    collideCar(car, [rock], events, state.stats);
    expect(car.damage.wear).toBe(0);
    expect(events).toHaveLength(0);
    expect(car.u).toBeLessThan(1);
  });
});

describe("the wreck", () => {
  it("wear reaching 1 wrecks the car: crash, respawn, patched half-way back", () => {
    const state = freshState();
    const boulder = solid({ x: 30, z: 250, y: -0.35, radius: 2, height: 2 });
    state.terrain = {
      ...state.terrain,
      heightAt: () => -0.35,
      groundAt: () => -0.35,
      waterAt: () => null,
      obstaclesNear: (x, z, r) =>
        Math.hypot(boulder.x - x, boulder.z - z) < r + boulder.radius ? [boulder] : [],
      treesNear: () => [],
    };
    state.car.x = 30;
    state.car.z = 200;
    state.car.y = -0.35;
    state.car.u = 30;
    const events: GameEvent[] = [];
    // Keep ramming the rock — the chassis runs out of life.
    for (let i = 0; i < 120 * 30 && !events.some((e) => e.type === "crash"); i++) {
      events.push(...step(state, { ...NEUTRAL_INPUT, throttle: 1 }));
    }
    const crash = events.find((e) => e.type === "crash");
    expect(crash).toMatchObject({ type: "crash", into: "wreck" });
    expect(events.some((e) => e.type === "respawn")).toBe(true);
    expect(state.car.damage.wear).toBe(TUNING.collision.repairTo);
    // The dents and the torn-off parts survive the service.
    expect(state.car.damage.zones[0]).toBeGreaterThan(0);
    expect(state.car.damage.broken.length).toBeGreaterThan(0);
    expect(state.stats.crashes).toBe(1);
  });
});

describe("the internal systems", () => {
  it("crush lands on the system living behind the struck panel", () => {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    const tree = solid({ kind: "tree", z: car.z + TUNING.collision.halfLength + 0.5 });
    collideCar(car, [tree], [], state.stats);
    expect(car.damage.systems.engine).toBeGreaterThan(0.2); // nose → radiator
    expect(car.damage.systems.gearbox).toBe(0); // the back is untouched
  });

  it("engine damage bleeds power — a beaten car is slower", () => {
    const run = (engine: number): number => {
      const state = freshState();
      state.car.damage.systems.engine = engine;
      for (let i = 0; i < 120 * 10; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      return state.car.u;
    };
    expect(run(1)).toBeLessThan(run(0) * 0.95);
  });

  it("steering damage bleeds authority — a bent rack turns less", () => {
    // A gentle corner, well under the slide threshold — where the wheel's
    // own gain is the only thing turning the car.
    const run = (steering: number): number => {
      const state = freshState();
      state.car.damage.systems.steering = steering;
      state.car.u = 15;
      for (let i = 0; i < 120; i++) step(state, { ...NEUTRAL_INPUT, throttle: 0.4, steer: 0.3 });
      return Math.abs(state.car.heading);
    };
    expect(run(1)).toBeLessThan(run(0) * 0.85);
  });

  it("a hurt auto gearbox cuts throttle on every shift; a sound one is seamless", () => {
    const run = (gearbox: number): number => {
      const state = freshState();
      state.car.damage.systems.gearbox = gearbox;
      for (let i = 0; i < 120 * 12; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      return state.car.u;
    };
    expect(run(1)).toBeLessThan(run(0) - 0.5);
  });

  it("shot suspension turns an ordinary jump landing into an underside hit", () => {
    // A drop the sound car's tolerance absorbs exactly, and a shot one's
    // does not: slam just under hardLandSpeed.
    const land = (suspension: number): number => {
      const state = freshState();
      state.car.damage.systems.suspension = suspension;
      state.car.u = 20;
      state.car.y = 3.1; // free-fall to vy ≈ −9.9 at the flat road
      state.car.vy = 0;
      state.car.airborne = true;
      for (let i = 0; i < 120 * 2 && state.car.airborne; i++) step(state, NEUTRAL_INPUT);
      return state.car.damage.belly;
    };
    expect(land(0)).toBe(0);
    expect(land(1)).toBeGreaterThan(0);
  });
});

describe("hard landings", () => {
  it("a cliff plunge crushes the underside and wears the chassis", () => {
    const state = freshState();
    state.car.u = 20;
    state.car.y = 12; // a real drop: touchdown around 19 m/s of descent
    state.car.vy = 0;
    state.car.airborne = true;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 3 && state.car.airborne; i++) {
      events.push(...step(state, NEUTRAL_INPUT));
    }
    expect(state.car.airborne).toBe(false);
    const impact = events.find((e) => e.type === "impact");
    expect(impact).toBeDefined();
    if (impact?.type === "impact") expect(impact.belly).toBe(true);
    expect(state.car.damage.belly).toBeGreaterThan(0);
    expect(state.car.damage.wear).toBeGreaterThan(0);
    expect(state.car.damage.systems.suspension).toBeGreaterThan(0);
  });

  it("an ordinary jump landing leaves no marks", () => {
    const state = freshState();
    state.car.u = 25;
    state.car.y = 1.5;
    state.car.vy = 2; // a lip toss: up, over, down — slam well under the bar
    state.car.airborne = true;
    for (let i = 0; i < 120 * 3 && state.car.airborne; i++) step(state, NEUTRAL_INPUT);
    expect(state.car.airborne).toBe(false);
    expect(state.car.damage.wear).toBe(0);
  });
});

describe("the forest's trunks", () => {
  it("is deterministic: two fields from one track agree on every tree", () => {
    const track = compileTrack(11);
    const a = createTerrain(track).treesNear(300, 300, 400);
    const b = createTerrain(track).treesNear(300, 300, 400);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const tree of a) {
      expect(tree.kind).toBe("tree");
      expect(tree.radius).toBeGreaterThan(0.2);
      expect(tree.roll).toBeGreaterThanOrEqual(0);
      expect(tree.grove).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps its trunks off the road and its own clear margin", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    for (let i = 0; i < track.samples.length; i += 10) {
      const s = track.samples[i];
      for (const tree of terrain.treesNear(s.x, s.z, 25)) {
        const d = Math.hypot(tree.x - s.x, tree.z - s.z);
        expect(d).toBeGreaterThan(track.width / 2 + 4);
      }
    }
  });
});
