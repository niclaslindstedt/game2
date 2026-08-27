// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The open world: the terrain the car rides once it leaves the road, the
// speeds the surfaces allow, the attitude the ground puts in the body, the
// one crash left (deep water), and the two ways home — the reset input and
// the wedge check, since exploring never times out on its own. Terrain
// scenarios that need an exact landscape override the state's terrain field
// with a synthetic one; determinism and clearance run against the real field.

import { describe, expect, it } from "vitest";

import {
  APRON,
  LAKE_Y,
  NEUTRAL_INPUT,
  ROAD_CROSS,
  TUNING,
  compileTrack,
  createGame,
  createTerrain,
  step,
  trackLost,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const LONG_STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 9000, feature: "none" }];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  throttle: 1,
  ...overrides,
});

/** Step with the auto-shift the manual box needs to reach its top end. */
function stepShifting(state: GameState, input: CarInput): GameEvent[] {
  const shiftUp =
    state.spec.gearbox === "manual" &&
    state.car.gear < state.spec.gearTop.length - 1 &&
    state.car.u > state.spec.gearTop[state.car.gear] * TUNING.gearbox.upAt;
  return step(state, { ...input, shiftUp });
}

/** A run on a flat, dry, empty landscape — terrain scenarios override the
 * field so the scenario is exactly what the test says it is. */
function flatWild(state: GameState, heightAt: (x: number, z: number) => number): void {
  // groundAt is the surface the physics rides — a synthetic scenario must
  // override it too, or the car stays on the real field's lattice.
  state.terrain = {
    ...state.terrain,
    heightAt,
    groundAt: heightAt,
    waterAt: () => null,
    obstaclesNear: () => [],
    treesNear: () => [],
  };
}

describe("top speed", () => {
  it("the classic holds about 230 km/h flat out on gravel", () => {
    const state = createGame({
      seed: 3,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    for (let i = 0; i < 120 * 120; i++) stepShifting(state, drive());
    expect(state.stats.topSpeed * 3.6).toBeGreaterThan(224);
    expect(state.stats.topSpeed * 3.6).toBeLessThan(238);
  });

  it("the compact's auto box reaches its top gear and ~215 km/h", () => {
    const state = createGame({
      seed: 3,
      carId: "compact",
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    for (let i = 0; i < 120 * 120; i++) step(state, drive());
    expect(state.car.gear).toBe(state.spec.gearTop.length - 1);
    expect(state.stats.topSpeed * 3.6).toBeGreaterThan(205);
  });

  it("open nature allows about 150 km/h — fast, but not road pace", () => {
    const state = createGame({
      seed: 3,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => -0.35);
    state.car.x = 200;
    state.car.y = -0.35;
    let top = 0;
    for (let i = 0; i < 120 * 90; i++) {
      stepShifting(state, drive());
      if (state.offRoad) top = Math.max(top, state.car.u);
    }
    expect(state.offRoad).toBe(true);
    expect(top * 3.6).toBeGreaterThan(135);
    expect(top * 3.6).toBeLessThan(165);
  });
});

describe("exploring", () => {
  it("never respawns a car for merely being far off the road", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => -0.35);
    state.car.x = 60; // far beyond the old 16 m lost-car offset
    state.car.y = -0.35;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 6; i++) events.push(...step(state, drive()));
    expect(state.offRoad).toBe(true);
    expect(events.filter((e) => e.type === "respawn")).toHaveLength(0);
    expect(state.stats.offRoadTime).toBeGreaterThan(5);
  });

  it("runs out of ROAD at the ends, not just at the edges (R24)", () => {
    // The apron is the last road there is: one apron behind the start line
    // and the terrain owns the ground. Without that, the nearest sample at
    // the end of the stage stays nearest forever and the car reverses away
    // down an invisible flat ribbon, held at the start's elevation over
    // whatever the country is doing — floating over a valley, buried in a
    // hillside, and driving straight through both.
    const state = createGame({ seed: 2, skipCountdown: true });
    const grid = state.track.samples[0];
    // Set down ON the ground it is being moved to: dropped from the start's
    // height into a valley the car is simply falling, and a fall is a
    // different test.
    const back = (metres: number): void => {
      state.car.x = grid.x - Math.sin(grid.heading) * metres;
      state.car.z = grid.z - Math.cos(grid.heading) * metres;
      state.car.y = state.terrain.groundAt(state.car.x, state.car.z);
    };
    // On the apron the road still answers, flat at the grid's own height.
    back(APRON * 0.5);
    step(state, NEUTRAL_INPUT);
    expect(state.offRoad).toBe(false);
    expect(state.car.y).toBeCloseTo(grid.elevation, 1);
    expect(state.terrain.groundAt(state.car.x, state.car.z)).toBeCloseTo(grid.elevation, 1);
    // Past it the ground is the terrain's, and it is nothing like flat.
    back(APRON + 90);
    step(state, NEUTRAL_INPUT);
    expect(state.offRoad).toBe(true);
    expect(state.car.y).toBeCloseTo(state.terrain.groundAt(state.car.x, state.car.z), 1);
    expect(Math.abs(state.car.y - grid.elevation)).toBeGreaterThan(1);
  });

  it("wedged against a rock with the throttle buried: back on the road in 2 s", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    const boulder = {
      x: 30,
      z: 250,
      y: -0.35,
      kind: "boulder" as const,
      size: 1,
      spin: 0,
      radius: 2,
      height: 2,
    };
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
    state.car.z = 244;
    state.car.y = -0.35;
    state.car.u = 4; // a nudge into it, so the wedge is what stops the car
    // Chassis already spent: the service on the way home is what patches it.
    state.car.damage.wear = 1;

    let respawnAt = -1;
    for (let i = 0; i < 120 * 8 && respawnAt < 0; i++) {
      if (step(state, drive()).some((e) => e.type === "respawn")) respawnAt = state.t;
    }
    expect(respawnAt).toBeGreaterThan(TUNING.offTrack.stuck.after);
    expect(Math.abs(state.car.x)).toBeLessThan(1);
    expect(state.offRoad).toBe(false);
    expect(state.stats.crashes).toBe(0);
    expect(state.car.damage.wear).toBe(TUNING.collision.repairTo);
  });

  it("a car that is still covering ground is never called stuck", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // A slope steep enough to crawl up at walking pace but never wedge on.
    flatWild(state, (_x, z) => -0.35 + Math.max(0, z - 260) * 0.5);
    state.car.x = 60;
    state.car.z = 240;
    state.car.y = -0.35;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 12; i++) events.push(...step(state, drive()));
    expect(state.offRoad).toBe(true);
    expect(events.filter((e) => e.type === "respawn")).toHaveLength(0);
  });

  it("the reset input is the way home: back on the track at last progress", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => -0.35);
    state.car.x = 80;
    state.car.y = -0.35;
    for (let i = 0; i < 120; i++) step(state, drive());
    const events = step(state, drive({ reset: true }));
    expect(events.some((e) => e.type === "respawn")).toBe(true);
    expect(Math.abs(state.car.x)).toBeLessThan(1);
    expect(state.offRoad).toBe(false);
    expect(state.stats.crashes).toBe(0);
  });

  it("a sharp cliff edge at pace throws the car with no road lip anywhere", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // A plateau beside the road that ends in a 10 m drop across z = 400.
    flatWild(state, (_x, z) => (z < 400 ? -0.35 : -10.35));
    state.car.x = 100;
    state.car.z = 300;
    state.car.y = -0.35;
    state.car.u = 40;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 8; i++) events.push(...step(state, drive()));
    const takeoff = events.find((e) => e.type === "takeoff");
    const landing = events.find((e) => e.type === "landing");
    expect(takeoff).toBeDefined();
    expect(landing).toBeDefined();
    expect(state.stats.airTime).toBeGreaterThan(0.3);
  });
});

describe("crashes", () => {
  it("driving into deep water crashes and puts the car back on the track", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // Dry shelf out to x = 40, then the seabed far under the water table.
    const shelf = (x: number): number => (Math.abs(x) < 40 ? -0.35 : LAKE_Y - 6);
    state.terrain = {
      ...state.terrain,
      heightAt: shelf,
      groundAt: shelf,
      waterAt: (x) => (Math.abs(x) < 40 ? null : LAKE_Y),
      obstaclesNear: () => [],
      treesNear: () => [],
    };
    state.car.heading = Math.PI / 2; // straight off the road, toward the water
    state.car.u = 30;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 8; i++) events.push(...step(state, drive()));
    expect(events.some((e) => e.type === "crash")).toBe(true);
    expect(events.some((e) => e.type === "splash")).toBe(true);
    expect(events.some((e) => e.type === "respawn")).toBe(true);
    expect(state.stats.crashes).toBeGreaterThan(0);
    expect(Math.abs(state.car.x)).toBeLessThan(1);
  });

  it("a boulder at speed crushes and slows the car; a crawl is only a scuff", () => {
    const boulder = {
      x: 30,
      z: 250,
      y: -0.35,
      kind: "boulder" as const,
      size: 1,
      spin: 0,
      radius: 2,
      height: 2,
    };
    const run = (speed: number, throttle: number): { events: GameEvent[]; state: GameState } => {
      const state = createGame({
        seed: 3,
        skipCountdown: true,
        track: compileTrack(3, LONG_STRAIGHT),
      });
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
      state.car.z = speed > 10 ? 200 : 246;
      state.car.y = -0.35;
      state.car.u = speed;
      const events: GameEvent[] = [];
      for (let i = 0; i < 120 * 5; i++) {
        events.push(...step(state, { ...NEUTRAL_INPUT, throttle }));
      }
      return { events, state };
    };

    // Head-on at 30 m/s: no teleporting respawn — the nose folds, the
    // front bumper tears off, and most of the pace is gone in the hit.
    const fast = run(30, 0);
    const impact = fast.events.find((e) => e.type === "impact");
    expect(impact).toBeDefined();
    if (impact?.type === "impact") expect(impact.speed).toBeGreaterThan(20);
    expect(fast.state.stats.impacts).toBeGreaterThan(0);
    expect(fast.state.car.damage.zones[0]).toBeGreaterThan(0.1);
    expect(fast.state.car.damage.wear).toBeGreaterThan(0.3);
    expect(fast.state.car.damage.broken).toContain("bumperF");
    expect(fast.state.car.u).toBeLessThan(10);

    // A 2.5 m/s crawl into the rock: stopped by it, unmarked by it.
    const slow = run(2.5, 0.2);
    expect(slow.events.filter((e) => e.type === "impact")).toHaveLength(0);
    expect(slow.state.car.damage.wear).toBe(0);
    expect(slow.state.car.u).toBeLessThan(2.5);
    expect(Math.hypot(slow.state.car.x - boulder.x, slow.state.car.z - boulder.z)).toBeGreaterThan(
      boulder.radius - 0.1,
    );
  });
});

describe("the attitude the ground puts in the body", () => {
  it("a climb lifts the nose and a descent drops it", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // A 1-in-5 ramp running away down +z, out beside the road.
    flatWild(state, (_x, z) => z * 0.2);
    state.car.x = 60;
    state.car.z = 200;
    state.car.y = 40;
    state.car.u = 12;
    for (let i = 0; i < 120 * 3; i++) step(state, drive());
    expect(state.car.pitch).toBeGreaterThan(0.15); // nose up the ramp

    state.car.heading = Math.PI; // turn round and point down it
    state.car.u = 12;
    for (let i = 0; i < 120 * 3; i++) step(state, drive());
    expect(state.car.pitch).toBeLessThan(-0.15);
  });

  it("a hillside banks the car the way the hillside goes", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // Ground rising toward +x; heading 0 puts that rise on the car's right.
    flatWild(state, (x) => x * 0.25);
    state.car.x = 60;
    state.car.z = 200;
    state.car.y = 15;
    state.car.u = 10;
    for (let i = 0; i < 120 * 2; i++) step(state, drive());
    // Right side up, and by roughly the angle of the slope itself.
    expect(state.car.roll).toBeCloseTo(Math.atan(0.25), 1);
    // The camber is the GROUND's, never the drift's: a car thrown fully
    // sideways on the road leans by the road's own cross-section (R16 —
    // the crown, the wheel tracks) and by nothing else. That is a fraction
    // of a degree, where the hillside above banks it by fourteen.
    const level = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // Above the drift's speed floor (TUNING.drift.slideFrom) — under it the
    // car only steers, so a standing start would never go sideways at all.
    level.car.u = 30;
    for (let i = 0; i < 120 * 2 && !level.offRoad; i++) step(level, drive({ steer: 1 }));
    // Sideways is an ANGLE, not a slide fraction: `slide` is where the car
    // sits in the hand-over from grip, so widening that band moves it
    // without the car being any less crossed up.
    expect(Math.abs(level.car.slip)).toBeGreaterThan(TUNING.drift.enterSlip);
    const crown = Math.atan((2 * ROAD_CROSS.crown.gravel) / (level.track.width / 2));
    expect(Math.abs(level.car.roll)).toBeLessThan(crown);
  });
});

describe("the terrain field", () => {
  it("is deterministic: two fields from one track agree everywhere", () => {
    const track = compileTrack(11);
    const a = createTerrain(track);
    const b = createTerrain(track);
    for (let i = 0; i < 200; i++) {
      const x = ((i * 373) % 2000) - 1000;
      const z = ((i * 761) % 3000) - 500;
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
    const oa = a.obstaclesNear(500, 500, 300);
    const ob = b.obstaclesNear(500, 500, 300);
    expect(oa).toEqual(ob);
    expect(oa.length).toBeGreaterThan(0);
  });

  it("keeps its solid props off the road", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    for (let i = 0; i < track.samples.length; i += 10) {
      const s = track.samples[i];
      for (const ob of terrain.obstaclesNear(s.x, s.z, 30)) {
        const d = Math.hypot(ob.x - s.x, ob.z - s.z);
        expect(d).toBeGreaterThan(track.width / 2 + ob.radius);
      }
    }
  });

  it("holds a flat shelf under the road and open landscape beyond it", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    const s = track.samples[100];
    // Under the road the shelf sits pinned just below grade.
    expect(terrain.heightAt(s.x, s.z)).toBeCloseTo(s.elevation - 0.35, 1);
    // Far away the landscape is its own: finite and varied.
    const far = terrain.heightAt(s.x + 2000, s.z + 2000);
    expect(Number.isFinite(far)).toBe(true);
  });
});

// WHEN THE PLAYER IS LOST, which is not the same question as whether they
// are off the road. The way home is an ALERT, and an alert that fires every
// time a wheel clips the verge — or every time the stage happens to run
// alongside the field being crossed — is one the player learns to ignore.
describe("knowing the player is lost", () => {
  /** Park the car `metres` out to the right of the start line, pointed
   * `turn` radians off the road's own heading. */
  function strayed(metres: number, turn: number): GameState {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    const home = state.track.samples[0];
    // The road's right in world space is (cos h, -sin h).
    state.car.x = home.x + metres * Math.cos(home.heading);
    state.car.z = home.z - metres * Math.sin(home.heading);
    state.car.heading = home.heading + turn;
    state.offRoad = true;
    return state;
  }

  /** Straight out to the right of the line: home is directly behind. */
  const AWAY = Math.PI / 2;

  it("says nothing while the car is still beside the road", () => {
    expect(trackLost(strayed(12, AWAY))).toBe(false);
  });

  it("says nothing about a car crossing perpendicular to the road", () => {
    // Pointed along the stage with the road out to one side: off it, well
    // clear of it, and not going anywhere away from it.
    expect(trackLost(strayed(60, 0))).toBe(false);
  });

  it("speaks up for a car well out and pointed away", () => {
    expect(trackLost(strayed(60, AWAY))).toBe(true);
  });

  it("never speaks up for a car that is on the road at all", () => {
    const state = strayed(60, AWAY);
    state.offRoad = false;
    expect(trackLost(state)).toBe(false);
  });

  it("holds on past the thresholds it came on at", () => {
    // Already lost, now turned back to perpendicular and half the distance
    // in: neither test has cleared, so the sign stays up rather than
    // blinking at every twitch of the wheel.
    const state = strayed(17, AWAY * 1.05);
    state.lost = true;
    expect(trackLost(state)).toBe(true);
    // Nose round toward the road and it clears.
    state.car.heading = state.track.samples[0].heading;
    expect(trackLost(state)).toBe(false);
  });
});
