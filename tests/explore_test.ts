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
  CARS,
  GROUND_CELL,
  LAKE_Y,
  NEUTRAL_INPUT,
  ROAD_CROSS,
  STAGE_RULES as R,
  TUNING,
  compileStage,
  compileTrack,
  corridorOffset,
  createGame,
  createTerrain,
  standSolid,
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
    state.car.gearbox === "manual" &&
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
  /** Flat out down the long straight until the car stops gaining, km/h. */
  function flatOutTop(carId: string): number {
    const state = createGame({
      seed: 3,
      carId,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    for (let i = 0; i < TUNING.physicsHz * 120; i++) step(state, drive());
    expect(state.car.gear).toBe(state.spec.gearTop.length - 1);
    return state.stats.topSpeed * 3.6;
  }

  it("every car reaches its top gear on the auto box and settles under its ceiling", () => {
    for (const car of CARS) {
      const top = flatOutTop(car.id);
      // Drag always wins in the end: the nominal gear ceiling is a number
      // the car approaches, never one it holds (see cars.ts).
      expect(top).toBeLessThan(car.gearTop[car.gearTop.length - 1] * 3.6);
      expect(top).toBeGreaterThan(car.gearTop[car.gearTop.length - 1] * 3.6 * 0.78);
    }
  });

  it("the roster's top speeds rank by its gearing — the 4WD fastest, the saloon slowest", () => {
    const tops = Object.fromEntries(CARS.map((c) => [c.id, flatOutTop(c.id)]));
    expect(tops.coupe).toBeGreaterThan(tops.compact);
    expect(tops.compact).toBeGreaterThan(tops.classic);
    // The spread is worth having: a car whose top end is 20% off the
    // fastest is a real trade for what it is given in exchange.
    expect(tops.coupe / tops.classic).toBeGreaterThan(1.15);
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
    for (let i = 0; i < TUNING.physicsHz * 90; i++) {
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
    for (let i = 0; i < TUNING.physicsHz * 6; i++) events.push(...step(state, drive()));
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
    // Standing on the TERRAIN, not on the ribbon: at the height of the
    // ground under it, or up to the lift its own footprint asks for where
    // that ground is not level under the whole body (see seatOn).
    const under = state.terrain.groundAt(state.car.x, state.car.z);
    expect(state.car.y).toBeGreaterThanOrEqual(under - 1e-6);
    expect(state.car.y - under).toBeLessThan(TUNING.collision.halfLength);
    expect(Math.abs(state.car.y - grid.elevation)).toBeGreaterThan(1);
  });

  it("wedged against a rock with the throttle buried: back on the road in 2 s", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    const boulder = standSolid({
      x: 30,
      z: 250,
      y: -0.35,
      kind: "boulder" as const,
      size: 1,
      spin: 0,
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
    state.car.z = 244;
    state.car.y = -0.35;
    state.car.u = 4; // a nudge into it, so the wedge is what stops the car
    // Chassis already spent: the service on the way home is what patches it.
    state.car.damage.wear = 1;

    let respawnAt = -1;
    for (let i = 0; i < TUNING.physicsHz * 8 && respawnAt < 0; i++) {
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
    for (let i = 0; i < TUNING.physicsHz * 12; i++) events.push(...step(state, drive()));
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
    for (let i = 0; i < TUNING.physicsHz; i++) step(state, drive());
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
    for (let i = 0; i < TUNING.physicsHz * 8; i++) events.push(...step(state, drive()));
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
    for (let i = 0; i < TUNING.physicsHz * 8; i++) events.push(...step(state, drive()));
    expect(events.some((e) => e.type === "crash")).toBe(true);
    expect(events.some((e) => e.type === "splash")).toBe(true);
    expect(events.some((e) => e.type === "respawn")).toBe(true);
    expect(state.stats.crashes).toBeGreaterThan(0);
    expect(Math.abs(state.car.x)).toBeLessThan(1);
  });

  it("a boulder at speed crushes and slows the car; a crawl is only a scuff", () => {
    const boulder = standSolid({
      x: 30,
      z: 250,
      y: -0.35,
      kind: "boulder" as const,
      size: 1,
      spin: 0,
    });
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
      for (let i = 0; i < TUNING.physicsHz * 5; i++) {
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
    for (let i = 0; i < TUNING.physicsHz * 3; i++) step(state, drive());
    expect(state.car.pitch).toBeGreaterThan(0.15); // nose up the ramp

    state.car.heading = Math.PI; // turn round and point down it
    state.car.u = 12;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) step(state, drive());
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
    for (let i = 0; i < TUNING.physicsHz * 2; i++) step(state, drive());
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
    for (let i = 0; i < TUNING.physicsHz * 2 && !level.offRoad; i++)
      step(level, drive({ steer: 1 }));
    // Sideways is an ANGLE, not a slide fraction: `slide` is where the car
    // sits in the hand-over from grip, so widening that band moves it
    // without the car being any less crossed up.
    expect(Math.abs(level.car.slip)).toBeGreaterThan(TUNING.drift.enterSlip);
    const crown = Math.atan((2 * ROAD_CROSS.crown.gravel) / (level.track.width / 2));
    expect(Math.abs(level.car.roll)).toBeLessThan(crown);
  });
});

describe("where the body stands on uneven ground", () => {
  it("keeps the whole body out of the ground on a face steeper than the body can pitch to", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // A 1-in-1.4 face — steeper than TUNING.attitude.pitchMax can lean the
    // body to, which is exactly the case that used to bury the nose.
    const grade = 0.7;
    const heightAt = (_x: number, z: number): number => z * grade;
    flatWild(state, heightAt);
    state.car.x = 60;
    state.car.z = 200;
    state.car.y = heightAt(60, 200);
    state.car.u = 6;
    for (let i = 0; i < TUNING.physicsHz * 2; i++) step(state, drive());

    // Every corner of the body box, at the attitude the renderer draws it,
    // stands at or above the ground it is over.
    const car = state.car;
    const hl = TUNING.collision.halfLength;
    const hw = TUNING.collision.halfWidth;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    for (const lz of [hl, -hl]) {
      for (const lx of [hw, -hw]) {
        const x = car.x + sinH * lz + cosH * lx;
        const z = car.z + cosH * lz - sinH * lx;
        const corner = car.y + lz * Math.sin(car.pitch) + lx * Math.sin(car.roll);
        expect(corner).toBeGreaterThanOrEqual(heightAt(x, z) - 1e-6);
      }
    }
  });

  it("still sits exactly on flat ground — the seat is a lift, not a hover", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => 12);
    state.car.x = 60;
    state.car.z = 200;
    state.car.y = 12;
    state.car.u = 8;
    for (let i = 0; i < TUNING.physicsHz; i++) step(state, drive());
    expect(state.car.y).toBeCloseTo(12, 6);
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
    // Under the road the shelf sits pinned below grade — under the outer
    // VERGE, which is the lowest line the corridor is drawn on (R31), and
    // then the tile clearance under that. It is never above the road.
    const shelf = terrain.heightAt(s.x, s.z);
    expect(shelf).toBeLessThan(s.elevation);
    expect(shelf).toBeGreaterThan(s.elevation - 1.5);
    // Far away the landscape is its own: finite and varied.
    const far = terrain.heightAt(s.x + 2000, s.z + 2000);
    expect(Number.isFinite(far)).toBe(true);
  });

  // R31 — THE RIDEABLE VERGE. A rally car spends half a stage off the road
  // and the one thing it must always be able to do is come back, so the
  // landscape does not get the last word next to a road. Both halves of the
  // rule are measured on `groundAt` — the LATTICE the car actually rides and
  // the renderer actually draws — because every version of them stated
  // against the analytic field passes by construction and says nothing.
  describe("R31 — the rideable verge", () => {
    const seeds = [3, 7, 11, 21];

    it("states its bench in metres, and it covers a ground cell's diagonal", () => {
      // The whole guarantee below rests on this: every corner of a lattice
      // cell a road crosses lies inside one diagonal of that road.
      expect(R.verge.bench).toBeGreaterThanOrEqual(GROUND_CELL * Math.SQRT2);
      // ...and the grade past it is one the car can climb, with room for
      // what a triangle spanning a cell diagonal reads back.
      expect(R.verge.climb * Math.SQRT2).toBeLessThan(TUNING.collision.climbLimit);
    });

    it("never drags the ground up through the road it is drawn beside", () => {
      // On the LATTICE, rebuilt here the way the ground tiles are built:
      // `heightAt` at the cell corners, interpolated across the same two
      // triangles. That is the only surface this can be asked of — the
      // analytic field between the corners is not what anybody sees or
      // drives, and a version of this stated against it passes by
      // construction. Before R31 a hillside beside the road dragged a
      // triangle seven metres up through the tarmac.
      for (const seed of seeds) {
        const track = compileStage(seed, "medium");
        const terrain = createTerrain(track);
        const corner = (i: number, j: number): number =>
          terrain.heightAt(i * GROUND_CELL, j * GROUND_CELL);
        const latticeAt = (x: number, z: number): number => {
          const gx = x / GROUND_CELL;
          const gz = z / GROUND_CELL;
          const i = Math.floor(gx);
          const j = Math.floor(gz);
          const fx = gx - i;
          const fz = gz - j;
          if (fx + fz <= 1) {
            const h = corner(i, j);
            return h + fx * (corner(i + 1, j) - h) + fz * (corner(i, j + 1) - h);
          }
          const h = corner(i + 1, j + 1);
          return h + (1 - fx) * (corner(i, j + 1) - h) + (1 - fz) * (corner(i + 1, j) - h);
        };
        const half = track.width / 2;
        for (let k = 0; k < track.samples.length; k += 3) {
          const s = track.samples[k];
          if (s.deck) continue;
          const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
          for (let lat = -half; lat <= half; lat += 2) {
            const tile = latticeAt(s.x + right.x * lat, s.z + right.z * lat);
            expect(tile).toBeLessThan(s.elevation + corridorOffset(s, lat, track.width));
          }
        }
      }
    });

    it("holds the whole landscape under a cone the car could drive up", () => {
      // The rule itself, stated where it is made: the field is capped at
      // the road's own underside, opening upward past the bench. No
      // tolerance — a hillside, a mountain's toe, a corner guard's mound
      // and the far field's blend are all cut to this exactly.
      //
      // R34 makes the cone two-sided rather than one grade: `verge.climb`
      // out to a whole lattice cell past the bench, which is the runoff a
      // car that goes off has to come back up, and past THAT the face the
      // road was cut through — up to `cut.face` where the rock stands. The
      // bound below is the loosest the dials allow, because it is a bound:
      // what it is here to catch is a cone that stopped binding at all, and
      // a stage that quietly grew a wall inside the runoff.
      //
      // What is cut is the LANDSCAPE, and the exemption is the other half of
      // the rule: a point standing on ANOTHER road's own shelf is not
      // landscape, and this road's cone has no business cutting it. Without
      // that exemption the cone from a branch sixty metres off and twenty
      // metres down reached in under the route and took the ground out from
      // beneath it. So a probe nearer to some other piece of road than to
      // the sample it was launched from is skipped — it belongs to that
      // road, and that road's own cone is what holds it.
      for (const seed of seeds) {
        const track = compileStage(seed, "medium");
        const terrain = createTerrain(track);
        const edge = track.width / 2 + ROAD_CROSS.reach;
        /** Is this point on an ABANDONED BRANCH's own corridor? The route's
         * distance field does not know about them, so the branch samples go
         * into a grid of cells `edge` across and a query reads its own cell
         * and the ring around it — a walk of every branch per probe is a
         * hundred thousand distances and times this test out. */
        const cell = (x: number, z: number): string =>
          `${Math.floor(x / edge)},${Math.floor(z / edge)}`;
        const branchCells = new Map<string, { x: number; z: number }[]>();
        for (const spur of track.spurs) {
          for (const sample of spur.samples) {
            const key = cell(sample.x, sample.z);
            const bucket = branchCells.get(key);
            if (bucket) bucket.push(sample);
            else branchCells.set(key, [sample]);
          }
        }
        const onBranch = (x: number, z: number): boolean => {
          const cx = Math.floor(x / edge);
          const cz = Math.floor(z / edge);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (const at of branchCells.get(`${cx + dx},${cz + dz}`) ?? []) {
                if (Math.hypot(at.x - x, at.z - z) < edge) return true;
              }
            }
          }
          return false;
        };
        let probes = 0;
        for (let i = 0; i < track.samples.length; i += 3) {
          const s = track.samples[i];
          if (s.deck) continue;
          const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
          for (const side of [-1, 1]) {
            const top = s.elevation + corridorOffset(s, side * edge, track.width);
            for (let out = 0; out <= 25; out++) {
              const lat = side * (edge + out);
              const x = s.x + right.x * lat;
              const z = s.z + right.z * lat;
              // On another arm of the route, or on a branch: that road's.
              if (terrain.roadDistanceAt(x, z) < Math.abs(lat) - 0.5) continue;
              if (onBranch(x, z)) continue;
              probes += 1;
              // R31's runoff, then R34's face. `out` is measured from the
              // corridor's lip and the cone from the centerline, so the
              // runoff reaches this much further out than the bench does.
              const runoff = Math.max(0, R.verge.bench + GROUND_CELL - edge);
              const rise =
                R.verge.climb * Math.min(out, runoff) +
                R.verge.cut.face.max * Math.max(0, out - runoff);
              expect(terrain.heightAt(x, z)).toBeLessThanOrEqual(top + rise);
            }
          }
        }
        // The exemption is narrow: almost every probe still gets asked.
        expect(probes, `seed ${seed}`).toBeGreaterThan(track.samples.length * 10);
      }
    });

    it("leaves almost nothing beside the road the car cannot climb back over", () => {
      // And what that BUYS, measured on the lattice the car actually rides.
      // Not zero: R18 cuts a stream its banks, a second road's own drawn
      // corridor can stand proud of the country beside it, and a triangle
      // spanning a cell diagonal reads a Lipschitz field back steeper than
      // it is. Before R31 it was four to six percent of the ground beside
      // the road — walls a car sliding off it stopped dead against.
      //
      // R34's CUTTINGS are the one wall that is there on purpose, so they
      // are not counted — but the runoff in front of them is, which is the
      // half of R34 worth pinning: a face may stand over the verge, and it
      // may not stand ON it. `cutAt` is the field's own answer to which
      // ground is a cutting, so this asks the rule rather than a distance,
      // and it is asked at ANY strength: a probe the field calls cut at all
      // is a probe this claim was never making, and picking a threshold
      // here would only be picking how much of a cutting to call landscape.
      const limit = TUNING.collision.climbLimit;
      let probes = 0;
      let walls = 0;
      for (const seed of seeds) {
        const track = compileStage(seed, "medium");
        const terrain = createTerrain(track);
        const edge = track.width / 2 + ROAD_CROSS.reach;
        for (let i = 0; i < track.samples.length; i += 5) {
          const s = track.samples[i];
          if (s.deck) continue;
          const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
          for (const side of [-1, 1]) {
            let prev = terrain.groundAt(s.x + right.x * side * edge, s.z + right.z * side * edge);
            for (let out = 1; out <= 25; out++) {
              const lat = side * (edge + out);
              const px = s.x + right.x * lat;
              const pz = s.z + right.z * lat;
              const here = terrain.groundAt(px, pz);
              // The face is measured LEAVING the road: what a car sliding
              // off it drives into. A drop is the country's business — a
              // rise it cannot get over is not. R34's blasted rock is the
              // exception, and only where the field says it is rock.
              if (terrain.cutAt(px, pz) > 0) {
                prev = here;
                continue;
              }
              probes++;
              if (here - prev >= limit) walls++;
              prev = here;
            }
          }
        }
      }
      expect(walls / probes).toBeLessThan(0.005);
    });
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

  it("holds on all the way back, and clears only on the road itself", () => {
    // Already lost, now nosed straight at the road and a few metres from
    // it: both of the tests that brought the sign ON have cleared, and it
    // stays up anyway. RETURN TO TRACK is an instruction, and driving
    // toward the track is not the same as being on it.
    const state = strayed(60, AWAY);
    state.lost = true;
    state.car.x = state.track.samples[0].x + 4 * Math.cos(state.track.samples[0].heading);
    state.car.z = state.track.samples[0].z - 4 * Math.sin(state.track.samples[0].heading);
    state.car.heading = state.track.samples[0].heading - AWAY;
    expect(trackLost(state)).toBe(true);
    // Back on the road, and only then, it goes.
    state.offRoad = false;
    expect(trackLost(state)).toBe(false);
  });
});
