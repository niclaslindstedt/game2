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
  collideCar,
  collideCars,
  compileTrack,
  createGame,
  createTerrain,
  damageZoneAt,
  standSolid,
  step,
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
    state.car.damage.systems.engine = 1;
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

  it("everything at its worst still leaves a car that can be driven home", () => {
    const state = freshState();
    const damage = state.car.damage;
    damage.wear = 1;
    damage.belly = TUNING.collision.zoneMax;
    for (let i = 0; i < DAMAGE_ZONES; i++) damage.zones[i] = TUNING.collision.zoneMax;
    for (const key of Object.keys(damage.systems) as (keyof typeof damage.systems)[]) {
      damage.systems[key] = 1;
    }
    damage.broken.push("hood", "hatch", "spoiler", "bumperF", "bumperR", "mirrorL", "mirrorR");
    for (let i = 0; i < TUNING.physicsHz * 40; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    // It still goes — no faster than a country road, and nowhere near what
    // the same car does sound (over 40 m/s).
    expect(state.car.u).toBeGreaterThan(8);
    expect(state.car.u).toBeLessThan(28);
    // ...and it still steers: the grip floor is what guarantees this.
    const before = state.car.heading;
    for (let i = 0; i < TUNING.physicsHz; i++)
      step(state, { ...NEUTRAL_INPUT, throttle: 0.5, steer: 1 });
    expect(Math.abs(state.car.heading - before)).toBeGreaterThan(0.3);
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
    const free = track.width / 2 + ROAD_CROSS.reach;
    for (let i = 0; i < track.samples.length; i += 10) {
      const s = track.samples[i];
      for (const ob of terrain.obstaclesNear(s.x, s.z, 40)) {
        if (ob.kind !== "rock" && ob.kind !== "slab" && ob.kind !== "stump") continue;
        const d = Math.hypot(ob.x - s.x, ob.z - s.z);
        expect(d - ob.radius).toBeGreaterThanOrEqual(free);
      }
    }
  });

  it("a small rock is knocked flying and barely slows the car", () => {
    const state = freshState();
    const car = state.car;
    car.u = 26;
    const events: GameEvent[] = [];
    // The smallest lump the field will stand up — a couple of hundred kilos
    // of stone against a tonne of car. It goes, the car does not.
    const rock = solid({
      kind: "rock",
      size: SOLID_PROP_HEIGHT / 1.05,
      x: car.x,
      z: car.z + TUNING.collision.halfLength + 0.2,
      y: car.y,
    });
    expect(rock.mass).toBeLessThan(state.spec.mass);
    collideCar(state.spec, car, [rock], events, state.stats);

    expect(car.u).toBeGreaterThan(26 * 0.7); // a bang and a dent, not a wall
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
      size: 0.5,
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
      size: 0.5,
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
