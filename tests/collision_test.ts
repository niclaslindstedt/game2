// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The contact model: the car as an oriented box against the wild's circular
// solids — the impulse that bounces and scrapes, the yaw kick that spins a
// clipped car, the crush that bends the body and tears parts off, and the
// wear that spends the chassis for good. Plus the fields that stand the
// solids up: the forest's trunks, and the litter and outcrops beside them —
// deterministic, dense where the groves are, and never on the road.

import { describe, expect, it } from "vitest";

import {
  DAMAGE_ZONES,
  NEUTRAL_INPUT,
  ROAD_CROSS,
  SOLID_PROP_HEIGHT,
  TUNING,
  clipSolids,
  collideCar,
  collideCars,
  compileTrack,
  createGame,
  createTerrain,
  damageZoneAt,
  landingDamage,
  ridesOver,
  standSolid,
  step,
  updateSlip,
  type GameEvent,
  type GameState,
  type WildObstacle,
} from "@engine";

const LONG_STRAIGHT = [{ kind: "straight", length: 9000, feature: "none" } as const];

function freshState(): GameState {
  return createGame({ seed: 3, skipCountdown: true, track: compileTrack(3, LONG_STRAIGHT) });
}

/** A staged solid — the same factory the terrain field plants with, so a
 * test collides with something the world could actually have stood up:
 * the shape of its kind at that size, and with it the mass, the rooting
 * and the strength the contact model reads off them. */
function solid(overrides: Partial<StagedSolid> = {}): WildObstacle {
  return standSolid({ x: 0, z: 0, y: 0, kind: "boulder", size: 1, spin: 0, ...overrides });
}

type StagedSolid = Parameters<typeof standSolid>[0];

/** The biggest tree a stage ever grows, and the smallest — the two ends of
 * the forest, which are two entirely different things to hit. */
const OLD_TREE = 1.35;
const SAPLING = 0.75;

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
    // The biggest trunk in the forest, dead ahead, just inside the nose:
    // at 108 km/h the car has not got the momentum to break it.
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      z: car.z + TUNING.collision.halfLength + 0.5,
      x: car.x,
    });
    const before = car.z;
    collideCar(state.spec, car, [tree], events, state.stats);

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
      size: SAPLING,
      x: car.x + TUNING.collision.halfWidth + 0.2,
      z: car.z,
    });
    collideCar(state.spec, car, [tree], events, state.stats);

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
    const tree = solid({
      kind: "tree",
      size: SAPLING,
      x: car.x + TUNING.collision.halfWidth + 0.2,
      z: car.z,
    });
    collideCar(state.spec, car, [tree], events, state.stats);

    expect(car.damage.broken).toContain("mirrorR");
    expect(car.damage.broken).not.toContain("bumperF");
    expect(car.damage.broken).not.toContain("bumperR");
  });

  it("the bonnet only lets go once the nose has folded well past the bumper", () => {
    const light = freshState();
    // 18 m/s: enough crush to shear the bumper's bolts, not the bonnet's.
    light.car.u = 18;
    const nose = solid({
      kind: "tree",
      size: OLD_TREE,
      x: light.car.x,
      z: light.car.z + TUNING.collision.halfLength + 0.5,
    });
    collideCar(light.spec, light.car, [nose], [], light.stats);
    expect(light.car.damage.broken).toContain("bumperF");
    expect(light.car.damage.broken).not.toContain("hood");

    const hard = freshState();
    hard.car.u = 34;
    collideCar(hard.spec, hard.car, [nose], [], hard.stats);
    expect(hard.car.damage.broken).toContain("hood");
    // The bonnet is a NOSE part: a rear-end hit must never take it.
    expect(hard.car.damage.broken).not.toContain("hatch");
  });

  it("a part breaks once — further hits on the same zone stay silent", () => {
    const state = freshState();
    const car = state.car;
    const events: GameEvent[] = [];
    const grid = car.z;
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x,
      z: grid + TUNING.collision.halfLength + 0.5,
    });
    car.u = 30;
    collideCar(state.spec, car, [tree], events, state.stats);
    car.u = 30;
    car.z = grid;
    collideCar(state.spec, car, [tree], events, state.stats);
    expect(events.filter((e) => e.type === "partBreak" && e.part === "bumperF")).toHaveLength(1);
  });

  it("a flight clears anything it is higher than", () => {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    car.y = 1.2;
    car.airborne = true;
    const events: GameEvent[] = [];
    const log = solid({ kind: "log", x: car.x, z: car.z + 1 });
    collideCar(state.spec, car, [log], events, state.stats);
    expect(car.u).toBe(30);
    expect(events).toHaveLength(0);
  });

  it("below the scuff floor a contact stops the car without marking it", () => {
    const state = freshState();
    const car = state.car;
    car.u = TUNING.collision.scuffSpeed - 0.5;
    const events: GameEvent[] = [];
    const rock = solid({ x: car.x, z: car.z + TUNING.collision.halfLength + 0.5 });
    collideCar(state.spec, car, [rock], events, state.stats);
    expect(car.damage.wear).toBe(0);
    expect(events).toHaveLength(0);
    expect(car.u).toBeLessThan(1);
  });
});

describe("the wreck", () => {
  it("wear reaching 1 leaves the car where it stands — a wreck is driven home", () => {
    const state = freshState();
    const car = state.car;
    const grid = car.z;
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x,
      z: grid + TUNING.collision.halfLength + 0.5,
    });
    // Ram it until the chassis has nothing left: three head-on hits at pace.
    for (let i = 0; i < 3; i++) {
      car.u = 30;
      car.z = grid;
      collideCar(state.spec, car, [tree], [], state.stats);
    }
    expect(car.damage.wear).toBe(1);

    // No crash, no respawn, no service: the car is still out there, bent.
    const events = step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    expect(events.some((e) => e.type === "crash")).toBe(false);
    expect(events.some((e) => e.type === "respawn")).toBe(false);
    expect(state.stats.crashes).toBe(0);
    expect(car.damage.wear).toBe(1);
  });
});

describe("the difficulty's damage assist", () => {
  /** A car with `damageScale` handed in, stood on the same long straight. */
  const scaled = (damageScale: number): GameState =>
    createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
      damageScale,
    });

  /** Drive `state` head-on into the biggest trunk in the forest at `u`
   * m/s. */
  const ram = (state: GameState, events: GameEvent[] = [], u = 30): GameEvent[] => {
    const car = state.car;
    car.u = u;
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.5,
    });
    collideCar(state.spec, car, [tree], events, state.stats);
    return events;
  };

  it("EASY writes nothing down — and the crash still happens in full", () => {
    const hard = scaled(1);
    const easy = scaled(0);
    const hardEvents = ram(hard);
    const easyEvents = ram(easy);

    // The physics is the world's, not the difficulty's: the same trunk stops
    // the car the same way, and it is heard and seen the same way too.
    expect(easy.car.u).toBeCloseTo(hard.car.u, 6);
    expect(easy.car.z).toBeCloseTo(hard.car.z, 6);
    expect(easy.car.rideRate).toBeCloseTo(hard.car.rideRate, 6);
    const hit = easyEvents.find((e) => e.type === "impact");
    expect(hit).toEqual(hardEvents.find((e) => e.type === "impact"));
    expect(easy.stats.impacts).toBe(1);

    // …and the ledger stays clean, so nothing bends the body, breaks a part
    // or costs the rest of the stage.
    expect(easy.car.damage.zones.every((z) => z === 0)).toBe(true);
    expect(easy.car.damage.wear).toBe(0);
    expect(easy.car.damage.systems.engine).toBe(0);
    expect(easy.car.damage.broken).toHaveLength(0);
    expect(easy.car.damage.version).toBe(0);
    expect(easyEvents.some((e) => e.type === "systemFail")).toBe(false);
    expect(hard.car.damage.zones[0]).toBeGreaterThan(0.2);
  });

  it("MEDIUM keeps half of every hit", () => {
    const full = scaled(1);
    const half = scaled(0.5);
    // Under the speed that kills the engine outright: a ledger pinned at
    // its top is not one that can be halved.
    ram(full, [], 15);
    ram(half, [], 15);
    expect(half.car.damage.zones[0]).toBeCloseTo(full.car.damage.zones[0] / 2, 6);
    expect(half.car.damage.wear).toBeCloseTo(full.car.damage.wear / 2, 6);
    expect(half.car.damage.systems.engine).toBeCloseTo(full.car.damage.systems.engine / 2, 6);
  });

  it("is the whole of it unless a run asks otherwise", () => {
    expect(freshState().car.damageScale).toBe(1);
  });
});

describe("what a broken car says about itself", () => {
  /** Every damage call one run made, in the order it made them. */
  const calls = (events: GameEvent[]): string[] =>
    events
      .filter((e) => e.type === "systemFail")
      .map((e) => (e.type === "systemFail" ? `${e.system}:${e.spent ? "spent" : "hurt"}` : ""));

  it("calls each system once as it gives, once as it goes", () => {
    const state = freshState();
    const car = state.car;
    const grid = car.z;
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x,
      z: grid + TUNING.collision.halfLength + 0.5,
    });
    // Nose-first into the trunk, over and over, at a pace that hurts the
    // engine a bite at a time rather than killing it outright: the engine
    // is the system behind the panel that folds, so it walks both lines.
    const events: GameEvent[] = [];
    for (let i = 0; i < 6; i++) {
      car.u = 10;
      car.z = grid;
      collideCar(state.spec, car, [tree], events, state.stats);
    }
    const said = calls(events);
    expect(car.damage.systems.engine).toBeGreaterThanOrEqual(TUNING.collision.callAt.spent);
    expect(said.filter((c) => c === "engine:hurt")).toHaveLength(1);
    expect(said.filter((c) => c === "engine:spent")).toHaveLength(1);
    expect(said.indexOf("engine:hurt")).toBeLessThan(said.indexOf("engine:spent"));
    // The shell is called on the same two lines as the machinery in it.
    expect(said).toContain("chassis:spent");
    // Nothing the crush never reached ever speaks up.
    expect(said.some((c) => c.startsWith("gearbox"))).toBe(false);
  });

  it("says nothing at all while the car is merely dented", () => {
    const state = freshState();
    const car = state.car;
    car.u = 0;
    car.w = 9; // sliding into a sapling, flank first: a scrape
    const events: GameEvent[] = [];
    collideCar(
      state.spec,
      car,
      [solid({ kind: "tree", size: SAPLING, x: car.x + TUNING.collision.halfWidth + 0.2 })],
      events,
      state.stats,
    );
    expect(car.damage.zones[2]).toBeGreaterThan(0);
    expect(calls(events)).toHaveLength(0);
  });
});

describe("the internal systems", () => {
  it("crush lands on the system living behind the struck panel", () => {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.5,
    });
    collideCar(state.spec, car, [tree], [], state.stats);
    expect(car.damage.systems.engine).toBeGreaterThan(0.2); // nose → radiator
    expect(car.damage.systems.gearbox).toBe(0); // the back is untouched
  });

  it("engine damage bleeds power — a beaten car is slower", () => {
    const run = (engine: number): number => {
      const state = freshState();
      state.car.damage.systems.engine = engine;
      for (let i = 0; i < TUNING.physicsHz * 10; i++)
        step(state, { ...NEUTRAL_INPUT, throttle: 1 });
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
      for (let i = 0; i < TUNING.physicsHz; i++)
        step(state, { ...NEUTRAL_INPUT, throttle: 0.4, steer: 0.3 });
      return Math.abs(state.car.heading);
    };
    expect(run(1)).toBeLessThan(run(0) * 0.85);
  });

  it("a hurt auto gearbox cuts throttle on every shift; a sound one is seamless", () => {
    const run = (gearbox: number): number => {
      const state = freshState();
      state.car.damage.systems.gearbox = gearbox;
      for (let i = 0; i < TUNING.physicsHz * 12; i++)
        step(state, { ...NEUTRAL_INPUT, throttle: 1 });
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
      for (let i = 0; i < TUNING.physicsHz * 2 && state.car.airborne; i++)
        step(state, NEUTRAL_INPUT);
      return state.car.damage.belly;
    };
    expect(land(0)).toBe(0);
    expect(land(1)).toBeGreaterThan(0);
  });
});

describe("a spent chassis and the panels left on the road", () => {
  /** Hold the throttle for `secs` on a long straight and report the pace. */
  const runTo = (secs: number, prep: (state: GameState) => void): number => {
    const state = freshState();
    prep(state);
    for (let i = 0; i < TUNING.physicsHz * secs; i++)
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    return state.car.u;
  };

  it("a worn-out shell drags: the same engine reaches a lower top end", () => {
    const sound = runTo(30, () => {});
    const spent = runTo(30, (state) => {
      state.car.damage.wear = 1;
    });
    expect(spent).toBeLessThan(sound * 0.95);
  });

  it("panels left on the road cost pace — a missing bonnet is a hole in the car", () => {
    const whole = runTo(30, () => {});
    const stripped = runTo(30, (state) => {
      state.car.damage.broken.push("hood", "hatch", "bumperF", "bumperR");
    });
    expect(stripped).toBeLessThan(whole);
  });

  it("a spent chassis brakes long — bent hubs cannot pull a car up", () => {
    const stop = (wear: number): number => {
      const state = freshState();
      state.car.damage.wear = wear;
      state.car.u = 30;
      let travelled = 0;
      for (let i = 0; i < TUNING.physicsHz * 12 && state.car.u > 1; i++) {
        const before = state.car.z;
        step(state, { ...NEUTRAL_INPUT, brake: 1 });
        travelled += Math.abs(state.car.z - before);
      }
      return travelled;
    };
    expect(stop(1)).toBeGreaterThan(stop(0) * 1.1);
  });

  it("deals the same crush for the same rub whatever the physics rate is", () => {
    // The invariant behind there being no collision rate of its own.
    // `collideCars` is an IMPULSE resolver — it kills the closing speed and
    // separates the pair — so what a rub costs is a fact about the speeds,
    // not about how often anybody asked. A heat run at two rates looks like
    // it disagrees, and that is fourteen bots taking different lines.
    //
    // Worth locking, because the obvious cheapening (resolve every other
    // step) and the obvious strengthening (a faster collision clock) are
    // both things somebody will reach for, and this says what they would
    // actually change: the first makes rubs cost less, and the second is a
    // no-op, since nothing moves between two steps for a second pass to find.
    // `TUNING` is `as const`, so the rates are readonly to a reader — which
    // is right, they are authored. Driving them is this test's whole point.
    const clock = TUNING as unknown as { physicsHz: number; dt: number };
    const rub = (hz: number): number => {
      const was = clock.physicsHz;
      clock.physicsHz = hz;
      clock.dt = 1 / hz;
      const mine = freshState();
      const theirs = freshState();
      const gap = TUNING.collision.halfWidth * 2 * 0.92;
      let crush = 0;
      for (let i = 0; i < 6; i++) {
        // Held alongside and pushed together at a fixed closing speed: the
        // same rub, whatever the clock.
        theirs.car.x = mine.car.x + gap;
        theirs.car.z = mine.car.z;
        mine.car.u = 30;
        theirs.car.u = 30;
        mine.car.w = 4;
        theirs.car.w = -4;
        collideCars(
          { spec: mine.spec, car: mine.car, events: [], stats: mine.stats },
          { spec: theirs.spec, car: theirs.car, events: [], stats: theirs.stats },
        );
      }
      for (const state of [mine, theirs]) {
        crush += state.car.damage.zones.reduce((a, z) => a + z, 0) + state.car.damage.belly;
      }
      clock.physicsHz = was;
      clock.dt = 1 / was;
      return crush;
    };
    const at120 = rub(120);
    expect(rub(60)).toBeCloseTo(at120, 10);
    expect(rub(30)).toBeCloseTo(at120, 10);
  });

  it("a body folded down one side pulls that way with the wheel dead straight", () => {
    const drift = (side: "right" | "left" | "none"): number => {
      const state = freshState();
      const zones = state.car.damage.zones;
      if (side !== "none") {
        const first = side === "right" ? 1 : 5;
        for (let i = 0; i < 3; i++) zones[first + i] = TUNING.collision.zoneMax;
      }
      state.car.u = 25;
      for (let i = 0; i < TUNING.physicsHz * 3; i++)
        step(state, { ...NEUTRAL_INPUT, throttle: 0.5 });
      return state.car.heading;
    };
    expect(drift("none")).toBeCloseTo(0, 5);
    // Positive heading is clockwise in map view: the crushed side is the
    // side the car goes.
    expect(drift("right")).toBeGreaterThan(0.15);
    expect(drift("left")).toBeLessThan(-0.15);
  });

  it("the wing that came off is grip the back of the car no longer has", () => {
    const held = (broken: boolean): number => {
      const state = freshState();
      if (broken) state.car.damage.broken.push("spoiler");
      state.car.u = 38;
      for (let i = 0; i < TUNING.physicsHz; i++)
        step(state, { ...NEUTRAL_INPUT, throttle: 0.6, steer: 0.5 });
      return Math.abs(state.car.slip);
    };
    expect(held(true)).toBeGreaterThan(held(false));
  });

  it("a gearbox past saving will not take its top ratio", () => {
    const state = freshState();
    state.car.damage.systems.gearbox = 1;
    for (let i = 0; i < TUNING.physicsHz * 40; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    expect(state.car.gear).toBe(state.spec.gearTop.length - 2);
    expect(state.car.u).toBeLessThan(state.spec.gearTop[state.spec.gearTop.length - 2]);
  });

  it("an engine past the misfire threshold drops beats — the power comes and goes", () => {
    const state = freshState();
    // Nearly gone, and still running: at 1 it is dead, which is the test
    // after the next.
    state.car.damage.systems.engine = 0.9;
    state.car.u = 20;
    let dead = 0;
    let firing = 0;
    for (let i = 0; i < TUNING.physicsHz * 6; i++) {
      const before = state.car.u;
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      if (state.car.u > before) firing += 1;
      else dead += 1;
    }
    // Both happen: a misfire is a stutter, not a dead engine and not a
    // smooth one.
    expect(dead).toBeGreaterThan(30);
    expect(firing).toBeGreaterThan(30);
  });

  it("everything short of the end still leaves a car that can be driven home", () => {
    const state = freshState();
    const damage = state.car.damage;
    damage.wear = 1;
    damage.belly = TUNING.collision.zoneMax;
    for (let i = 0; i < DAMAGE_ZONES; i++) damage.zones[i] = TUNING.collision.zoneMax;
    for (const key of Object.keys(damage.systems) as (keyof typeof damage.systems)[]) {
      damage.systems[key] = 1;
    }
    // The two things that END a run are held one step short of it: an
    // engine that is nearly dead, and four tyres that are flat but on.
    damage.systems.engine = 0.99;
    for (let i = 0; i < damage.wheels.length; i++) damage.wheels[i] = 0.99;
    damage.broken.push(
      "hood",
      "hatch",
      "spoiler",
      "bumperF",
      "bumperR",
      "mirrorL",
      "mirrorR",
      "glassF",
      "glassB",
      "glassL",
      "glassR",
      "doorL",
      "doorR",
    );
    for (let i = 0; i < TUNING.physicsHz * 40; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    // It still goes — no faster than a country road, and nowhere near what
    // the same car does sound (over 40 m/s).
    expect(state.phase).toBe("racing");
    expect(state.car.u).toBeGreaterThan(5);
    expect(state.car.u).toBeLessThan(28);
    // ...and it still steers: the grip floor is what guarantees this.
    const before = state.car.heading;
    for (let i = 0; i < TUNING.physicsHz; i++)
      step(state, { ...NEUTRAL_INPUT, throttle: 0.5, steer: 1 });
    expect(Math.abs(state.car.heading - before)).toBeGreaterThan(0.3);
  });

  it("a flat tyre pulls the car toward its own side, and a rim on the road costs pace", () => {
    const pull = (wheel: number): { heading: number; u: number } => {
      const state = freshState();
      state.car.damage.wheels[wheel] = TUNING.collision.chassis.wheelFlat;
      state.car.u = 25;
      for (let i = 0; i < TUNING.physicsHz * 3; i++)
        step(state, { ...NEUTRAL_INPUT, throttle: 0.5 });
      return { heading: state.car.heading, u: state.car.u };
    };
    const sound = freshState();
    sound.car.u = 25;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) step(sound, { ...NEUTRAL_INPUT, throttle: 0.5 });
    // FL is the engine's left, FR its right: each pulls its own way, by the
    // same amount, with the wheel dead straight.
    const left = pull(0);
    const right = pull(1);
    expect(left.heading).toBeLessThan(-0.05);
    expect(right.heading).toBeGreaterThan(0.05);
    expect(left.heading).toBeCloseTo(-right.heading, 3);
    expect(sound.car.heading).toBeCloseTo(0, 6);
    expect(left.u).toBeLessThan(sound.car.u);
  });

  it("the brakes give with the corners, and take the lever with them", () => {
    const stop = (brakes: number): number => {
      const state = freshState();
      state.car.damage.systems.brakes = brakes;
      state.car.u = 30;
      for (let i = 0; i < TUNING.physicsHz; i++) step(state, { ...NEUTRAL_INPUT, brake: 1 });
      return state.car.u;
    };
    // A cut line loses part of the pedal, never all of it...
    expect(stop(1)).toBeGreaterThan(stop(0));
    expect(stop(1)).toBeLessThan(30);
    // ...and nearly all of the lever, which is one cable: the same yank at
    // the same speed with the same lock finds a fraction of the angle.
    const yank = (brakes: number): number => {
      const state = freshState();
      state.car.damage.systems.brakes = brakes;
      state.car.u = 22;
      let most = 0;
      for (let i = 0; i < TUNING.physicsHz; i++) {
        step(state, { ...NEUTRAL_INPUT, throttle: 0.3, steer: 1, handbrake: true });
        most = Math.max(most, Math.abs(state.car.slip));
      }
      return most;
    };
    const held = yank(0);
    const lost = yank(1);
    expect(held).toBeGreaterThan(0.25);
    expect(lost).toBeLessThan(held * 0.6);
  });
});

describe("the end of the run", () => {
  it("a wall met square at 100 km/h kills the engine; at 50 it only hurts it", () => {
    const hit = (kmh: number): GameState => {
      const state = freshState();
      const car = state.car;
      car.u = kmh / 3.6;
      const rock = solid({
        kind: "boulder",
        size: 2.2,
        x: car.x,
        z: car.z + TUNING.collision.halfLength + 0.5,
      });
      collideCar(state.spec, car, [rock], [], state.stats);
      return state;
    };
    expect(hit(100).car.damage.systems.engine).toBe(1);
    const fifty = hit(50).car.damage.systems.engine;
    expect(fifty).toBeGreaterThan(0.3);
    expect(fifty).toBeLessThan(TUNING.collision.callAt.spent);
    // The glass and the bonnet are gone on the big one, and the nose is
    // folded a quarter of a metre: the car LOOKS like what happened to it.
    expect(hit(100).car.damage.broken).toEqual(
      expect.arrayContaining(["lampsF", "bumperF", "glassF", "hood"]),
    );
    expect(hit(100).car.damage.zones[0]).toBeGreaterThan(0.2);
  });

  it("the lamps are the first thing a cap loses — headlamps at the nose, tail lamps at the tail", () => {
    const end = (u: number): string[] => {
      const state = freshState();
      const car = state.car;
      const ahead = u > 0;
      const rock = solid({
        kind: "boulder",
        size: 2.2,
        x: car.x,
        z: car.z + (ahead ? 1 : -1) * (TUNING.collision.halfLength + 0.5),
      });
      car.u = u;
      collideCar(state.spec, car, [rock], [], state.stats);
      return car.damage.broken;
    };
    // Backing into a wall at 35 km/h takes the tail lamps and nothing else;
    // the nose at the same pace loses its headlamps, and the bumper only at
    // a real hit.
    expect(end(-35 / 3.6)).toEqual(["lampsR"]);
    expect(end(35 / 3.6)).toEqual(["lampsF"]);
    const hard = end(60 / 3.6);
    expect(hard).toContain("lampsF");
    expect(hard).toContain("bumperF");
    expect(hard).not.toContain("lampsR");
  });

  it("a dead engine stops the car for good, and the run is retired where it stops", () => {
    const state = freshState();
    state.car.damage.systems.engine = 1;
    state.car.u = 20;
    const from = state.car.z;
    const events: GameEvent[] = [];
    for (let i = 0; i < TUNING.physicsHz * 30 && state.phase === "racing"; i++) {
      events.push(...step(state, { ...NEUTRAL_INPUT, throttle: 1 }));
    }
    expect(state.phase).toBe("retired");
    const retire = events.find((e) => e.type === "retire");
    expect(retire).toEqual({ type: "retire", reason: "engine" });
    // It coasted to a stop in a few lengths, not a few hundred metres, and
    // nothing put it back on the road on the way: a throttle held on a
    // dead engine is not a wedge.
    expect(state.car.z - from).toBeLessThan(120);
    expect(state.car.u).toBe(0);
    expect(state.stats.respawns).toBe(0);
    expect(events.some((e) => e.type === "respawn")).toBe(false);
    // ...and it stays retired: the step does nothing further.
    const t = state.t;
    const after = step(state, { ...NEUTRAL_INPUT, throttle: 1, reset: true });
    expect(after).toHaveLength(0);
    expect(state.phase).toBe("retired");
    expect(state.t).toBeGreaterThan(t);
  });

  it("a corner driven into a trunk at pace takes the wheel off; the second wheel is the run", () => {
    const state = freshState();
    const car = state.car;
    const grid = car.z;
    // The trunk stands off the right-front corner, so the contact lands in
    // zone 1 and the crush reaches the front-right wheel.
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x + TUNING.collision.halfWidth + 0.15,
      z: grid + TUNING.collision.halfLength + 0.3,
    });
    const events: GameEvent[] = [];
    for (let i = 0; i < 3 && !car.damage.broken.includes("wheelFR"); i++) {
      car.u = 30;
      car.z = grid;
      collideCar(state.spec, car, [tree], events, state.stats);
    }
    expect(car.damage.wheels[1]).toBe(1);
    expect(car.damage.broken).toContain("wheelFR");
    expect(events).toContainEqual({ type: "wheelFail", wheel: 1, off: true });
    expect(events).toContainEqual({ type: "partBreak", part: "wheelFR" });
    // Three hits on the same trunk from the same spot stack three trips and
    // three shoves into the body — enough to roll it, or to skid it off
    // the road into the next tree, and either is a different run. What is
    // under test here is the wheel ledger, so the car is set back on its
    // wheels, straight, before it drives on.
    car.rollRate = 0;
    car.airborne = false;
    car.settling = false;
    car.vy = 0;
    car.w = 0;
    car.yawRate = 0;
    car.heading = state.track.samples[0].heading;
    updateSlip(car);
    // One wheel off is a car that still crawls...
    for (let i = 0; i < TUNING.physicsHz * 10; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    expect(state.phase).toBe("racing");
    // ...two is not.
    car.damage.wheels[3] = 1;
    car.damage.broken.push("wheelRR");
    let retired = false;
    for (let i = 0; i < TUNING.physicsHz * 30 && !retired; i++) {
      retired = step(state, { ...NEUTRAL_INPUT, throttle: 1 }).some(
        (e) => e.type === "retire" && e.reason === "wheels",
      );
    }
    expect(retired).toBe(true);
    expect(state.phase).toBe("retired");
  });

  it("a landing on the side is the wheels on that side", () => {
    const state = freshState();
    const car = state.car;
    car.roll = TUNING.air.rollLandLimit + 0.2; // right side up: the LEFT flank lands
    const events: GameEvent[] = [];
    landingDamage(state.spec, car, 26, events, state.stats);
    expect(car.damage.zones[6]).toBeGreaterThan(0);
    expect(car.damage.wheels[0]).toBeGreaterThan(0);
    expect(car.damage.wheels[2]).toBeGreaterThan(0);
    expect(car.damage.wheels[1]).toBe(0);
    expect(car.damage.wheels[3]).toBe(0);
    // And that arrival is the WHOLE of what reaches them: the ground folding
    // a flank is not a trunk driven into one corner of it, so the ring's own
    // point-impact rate is not charged a second time on top.
    expect(car.damage.wheels[0]).toBeCloseTo(
      car.damage.zones[6] * TUNING.collision.systems.wheelFromSideLand * 0.5,
      6,
    );
  });

  it("a car that comes down on its ROOF folds the greenhouse, not a flank", () => {
    const state = freshState();
    const car = state.car;
    car.roll = Math.PI; // upside down
    const events: GameEvent[] = [];
    landingDamage(state.spec, car, 14, events, state.stats);
    expect(car.damage.roof).toBeGreaterThan(0);
    expect(Math.max(...car.damage.zones)).toBe(0);
    expect(car.damage.belly).toBe(0);
    // The one arrival the ring has no room for, and the one that takes ALL
    // the glass: a shell that has lost its shape cannot hold a screen in it.
    const gone = events.filter((e) => e.type === "partBreak").map((e) => e.part);
    for (const pane of ["glassF", "glassB", "glassR", "glassL"]) expect(gone).toContain(pane);
    // The impact reads as flat-on — the ground met a whole face at once, so
    // there is no bearing on it for the dust or the pan to point at.
    const impact = events.find((e) => e.type === "impact");
    expect(impact?.type === "impact" && impact.belly).toBe(true);
  });

  it("a shell arrival pays where a sprung one lands free", () => {
    // The whole difference between a jump and a roll. `hardLandSpeed` is what
    // a SUSPENSION travels through for nothing; a flank has nothing under it,
    // so the same descent that a car on its wheels shrugs off folds a door.
    const free = freshState();
    landingDamage(free.spec, free.car, TUNING.collision.hardLandSpeed - 0.5, [], free.stats);
    expect(free.car.damage.belly).toBe(0);

    const shell = freshState();
    shell.car.roll = TUNING.air.rollLandLimit + 0.2;
    landingDamage(shell.spec, shell.car, TUNING.collision.hardLandSpeed - 0.5, [], shell.stats);
    expect(shell.car.damage.zones[6]).toBeGreaterThan(0);
  });

  it("a face folded to the cage stops feeding the machinery behind it", () => {
    // Past `zoneMax` the panel has nowhere left to go, and what is holding
    // the blow is the cage. The engine, the arms and the wheels behind that
    // panel stop taking the fold — only the wear goes on — or a car pinned
    // against one face grinds itself to pieces through metal that is no
    // longer moving.
    const state = freshState();
    const car = state.car;
    car.damage.zones[0] = TUNING.collision.zoneMax;
    car.damage.systems.engine = 0.2;
    const wasWear = car.damage.wear;
    const rock = solid({ kind: "boulder", size: 2.4, x: car.x, z: car.z + 4 });
    car.u = 26;
    collideCar(state.spec, car, [rock], [], state.stats);
    expect(car.damage.zones[0]).toBe(TUNING.collision.zoneMax);
    expect(car.damage.systems.engine).toBe(0.2);
    // The chassis still pays: a cage taking a blow is a cage being spent.
    expect(car.damage.wear).toBeGreaterThan(wasWear);
  });

  it("a flank driven hard into a rock shatters the glass and, harder, takes the door", () => {
    const state = freshState();
    const car = state.car;
    const rock = solid({ kind: "boulder", size: 2.2, x: car.x + TUNING.collision.halfWidth + 0.5 });
    const events: GameEvent[] = [];
    car.w = 24;
    collideCar(state.spec, car, [rock], events, state.stats);
    expect(car.damage.broken).toContain("mirrorR");
    expect(car.damage.broken).toContain("glassR");
    expect(car.damage.broken).not.toContain("doorR");
    for (let i = 0; i < 3 && !car.damage.broken.includes("doorR"); i++) {
      car.x = rock.x - TUNING.collision.halfWidth - 0.5;
      car.w = 24;
      collideCar(state.spec, car, [rock], events, state.stats);
    }
    expect(car.damage.broken).toContain("doorR");
    // The left side of the car never touched anything.
    expect(car.damage.broken).not.toContain("glassL");
    expect(car.damage.broken).not.toContain("doorL");
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
    for (let i = 0; i < TUNING.physicsHz * 3 && state.car.airborne; i++) {
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
    for (let i = 0; i < TUNING.physicsHz * 3 && state.car.airborne; i++) step(state, NEUTRAL_INPUT);
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

describe("the wild's litter and outcrops", () => {
  /** Every solid the prop field stands along one stage, deduplicated. */
  function propsAlong(seed: number): WildObstacle[] {
    const track = compileTrack(seed);
    const terrain = createTerrain(track);
    const seen = new Map<string, WildObstacle>();
    for (let i = 0; i < track.samples.length; i += 5) {
      const s = track.samples[i];
      for (const ob of terrain.obstaclesNear(s.x, s.z, 60)) {
        seen.set(`${ob.x},${ob.z}`, ob);
      }
    }
    return [...seen.values()];
  }

  it("stands rocks, stumps and outcrops along a stage", () => {
    const kinds = new Set(propsAlong(11).map((ob) => ob.kind));
    expect(kinds.has("rock")).toBe(true);
    expect(kinds.has("stump")).toBe(true);
    expect(kinds.has("slab")).toBe(true);
  });

  it("never places one below the middle of the hood", () => {
    // The bar is what makes app-side litter safe to drive over: anything
    // the field stands up reaches the body, so anything shorter is the
    // renderer's dressing and never a solid.
    for (const seed of [11, 23]) {
      for (const ob of propsAlong(seed)) {
        expect(ob.height).toBeGreaterThanOrEqual(SOLID_PROP_HEIGHT);
        expect(ob.radius).toBeGreaterThan(0);
      }
    }
  });

  it("keeps litter and outcrops off the road ribbon, rim and all", () => {
    // Trees stand past the ribbon's reach and so must these: the shoulder
    // and the ditch the road mesh draws stay clear, so a line that used to
    // be survivable still is.
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    for (let i = 0; i < track.samples.length; i += 10) {
      const s = track.samples[i];
      // R33 — the road's width HERE, never the stage's nominal. A gravel
      // road wanders either side of nominal down its whole length, and the
      // placement this is checking measures against the wander for a stated
      // reason (`props.ts`'s `halfAt`): a boulder set at nominal-plus-its-
      // clearance stands on the paving wherever the blade cut wide. Asked at
      // nominal, this reports every stone beside a stretch cut NARROW — 12.5
      // m of road against a 16.2 m nominal — as standing on a ribbon that is
      // not there, and it passed until now only because no seed had put one
      // in that band.
      const free = s.width / 2 + ROAD_CROSS.reach;
      for (const ob of terrain.obstaclesNear(s.x, s.z, 40)) {
        if (ob.kind !== "rock" && ob.kind !== "slab" && ob.kind !== "stump") continue;
        const d = Math.hypot(ob.x - s.x, ob.z - s.z);
        expect(d - ob.radius, `${ob.kind} at ${s.s.toFixed(0)} m`).toBeGreaterThanOrEqual(free);
      }
    }
  });

  it("the smallest lump the field stands up is ridden over, not hit", () => {
    const state = freshState();
    const car = state.car;
    car.u = 26;
    const events: GameEvent[] = [];
    const rock = solid({
      kind: "rock",
      size: SOLID_PROP_HEIGHT / 1.05,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.2,
      y: car.y,
    });
    expect(ridesOver(car, rock)).toBe(true);
    // The body's contact model has nothing to say about it...
    collideCar(state.spec, car, [rock], events, state.stats);
    expect(events).toHaveLength(0);
    expect(car.u).toBe(26);
    // ...the wheels do: a thump, a lurch, a little speed — and the stone
    // shoved out of its bed and away — but no fold, no wear.
    const gone: WildObstacle[] = [];
    clipSolids(state.spec, car, 1, [rock], events, (ob) => gone.push(ob));
    expect(events.some((e) => e.type === "kerbHit")).toBe(true);
    expect(car.u).toBeGreaterThan(26 * 0.85);
    expect(car.u).toBeLessThan(26);
    expect(car.damage.wear).toBe(0);
    expect(car.damage.zones[0]).toBe(0);
    expect(gone).toEqual([rock]);
    expect(events.some((e) => e.type === "solidBreak" && !e.broke)).toBe(true);
    // One bite per stone: the body is deaf to it until it has passed.
    const before = car.u;
    clipSolids(state.spec, car, 1 + TUNING.dt, [rock], events);
    expect(car.u).toBe(before);
  });

  it("a stone over the ride-over bar is the body's: knocked flying, and it costs", () => {
    const state = freshState();
    const car = state.car;
    car.u = 26;
    const events: GameEvent[] = [];
    // Just over the bar: half a tonne of stone against a tonne of car. It
    // goes, and the car pays its share of the momentum — a bang and a dent,
    // under half the pace, never a wall.
    const rock = solid({
      kind: "rock",
      size: (TUNING.collision.rideOver + 0.02) / 1.05,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.2,
      y: car.y,
    });
    expect(ridesOver(car, rock)).toBe(false);
    expect(rock.mass).toBeLessThan(state.spec.mass);
    collideCar(state.spec, car, [rock], events, state.stats);

    expect(car.u).toBeGreaterThan(26 * 0.5);
    const thrown = events.find((e) => e.type === "solidBreak");
    expect(thrown).toBeDefined();
    if (thrown?.type === "solidBreak") {
      expect(thrown.broke).toBe(false); // stone does not break, it moves
      expect(Math.hypot(thrown.vx, thrown.vz)).toBeGreaterThan(car.u);
    }
  });

  it("a rock heavier than the car stays exactly where it is", () => {
    const state = freshState();
    const car = state.car;
    car.u = 39; // 140 km/h
    const events: GameEvent[] = [];
    const rock = solid({
      kind: "rock",
      size: 2.1,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 1.6,
      y: car.y,
    });
    expect(rock.mass).toBeGreaterThan(state.spec.mass * 10);
    collideCar(state.spec, car, [rock], events, state.stats);

    expect(events.some((e) => e.type === "solidBreak")).toBe(false);
    expect(car.u).toBeLessThan(0); // stopped dead and bounced
    // ...and stopping at 140 km/h is what wrecks a car.
    expect(car.damage.wear).toBeGreaterThan(0.8);
    expect(car.damage.broken).toContain("bumperF");
  });
});

describe("what gives way", () => {
  it("a sapling snaps and the car drives through; the old tree does not", () => {
    const through = (size: number): { kept: number; broke: boolean } => {
      const state = freshState();
      const car = state.car;
      car.u = 25; // 90 km/h
      const events: GameEvent[] = [];
      const tree = solid({
        kind: "tree",
        size,
        x: car.x,
        z: car.z + TUNING.collision.halfLength + 0.3,
      });
      collideCar(state.spec, car, [tree], events, state.stats);
      return {
        kept: car.u,
        broke: events.some((e) => e.type === "solidBreak" && e.broke),
      };
    };
    const small = through(SAPLING);
    const old = through(OLD_TREE);
    expect(small.broke).toBe(true);
    expect(small.kept).toBeGreaterThan(5); // through it, and still moving
    expect(old.broke).toBe(false);
    expect(old.kept).toBeLessThan(0);
  });

  it("the biggest tree goes down at 140 km/h — and takes most of it with it", () => {
    const state = freshState();
    const car = state.car;
    car.u = 39;
    const events: GameEvent[] = [];
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.5,
    });
    collideCar(state.spec, car, [tree], events, state.stats);
    expect(events.some((e) => e.type === "solidBreak" && e.broke)).toBe(true);
    expect(car.u).toBeLessThan(12); // out the other side at walking-ish pace
    expect(car.damage.wear).toBeGreaterThan(0.5); // and bent for good
  });

  it("a trunk the field is told to fell stops standing, for the rest of the run", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    const at = track.samples[Math.floor(track.samples.length / 2)];
    const standing = terrain.treesNear(at.x, at.z, 120);
    expect(standing.length).toBeGreaterThan(0);
    const doomed = standing[0];
    terrain.fell(doomed);
    const after = terrain.treesNear(at.x, at.z, 120);
    expect(after).toHaveLength(standing.length - 1);
    expect(after.some((t) => t.x === doomed.x && t.z === doomed.z)).toBe(false);
    // The cell caches are dropped and rebuilt as road streams in, so the
    // question has to survive one: a felled tree that comes back is a tree
    // the car drives through the second time.
    terrain.sync(at.s);
    expect(terrain.treesNear(at.x, at.z, 120)).toHaveLength(standing.length - 1);
  });

  it("a felled solid is handed to the caller and never collided with twice", () => {
    const state = freshState();
    const car = state.car;
    const grid = car.z;
    const rock = solid({
      kind: "rock",
      size: 0.7,
      x: car.x,
      z: grid + TUNING.collision.halfLength + 0.4,
      y: car.y,
    });
    const gone: WildObstacle[] = [];
    car.u = 20;
    collideCar(state.spec, car, [rock], [], state.stats, (ob) => gone.push(ob));
    expect(gone).toEqual([rock]);
  });

  it("leaning on a rock below the scuff floor neither marks the car nor moves the rock", () => {
    const state = freshState();
    const car = state.car;
    car.u = TUNING.collision.scuffSpeed - 0.5;
    const events: GameEvent[] = [];
    const rock = solid({
      kind: "rock",
      size: 0.7,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.4,
      y: car.y,
    });
    collideCar(state.spec, car, [rock], events, state.stats);
    expect(events).toHaveLength(0);
    expect(car.damage.wear).toBe(0);
  });
});

describe("the trip", () => {
  it("a rock caught sideways at speed rolls the car and lifts it off the ground", () => {
    const state = freshState();
    const car = state.car;
    car.u = 5;
    car.w = 24; // sliding hard to its right, flank first
    const events: GameEvent[] = [];
    // Big enough that the ground holds it — you trip over what does not move.
    const rock = solid({
      kind: "rock",
      size: 0.9,
      x: car.x + TUNING.collision.halfWidth + 0.6,
      z: car.z,
      y: car.y,
    });
    collideCar(state.spec, car, [rock], events, state.stats);

    // Sliding right, checked at the sill: the car goes over onto its right,
    // and positive roll is the one that lifts that side.
    expect(car.rollRate).toBeLessThan(-TUNING.collision.solids.tripLaunch);
    expect(car.airborne).toBe(true); // over the outside wheels and off
    expect(car.vy).toBeGreaterThan(0);
  });

  it("a trunk meets the whole flank and only shoves — it never trips the car", () => {
    const state = freshState();
    const car = state.car;
    car.u = 5;
    car.w = 24;
    const tree = solid({
      kind: "tree",
      size: OLD_TREE,
      x: car.x + TUNING.collision.halfWidth + 0.5,
      z: car.z,
      y: car.y,
    });
    collideCar(state.spec, car, [tree], [], state.stats);
    expect(car.rollRate).toBe(0);
    expect(car.airborne).toBe(false);
  });
});
