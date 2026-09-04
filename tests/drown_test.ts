// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the WATER does to a car that ends up in it: the drowning penalty and
// the seconds it costs (TUNING.crash.drown), and the shallow entry the car
// drives back out of on its own (TUNING.crash.drown.shallows). The rules the
// water itself obeys — where a river runs and what the road does to cross it
// — are `tests/water_test.ts`; these are about the car.
//
// Both suites SEARCH for their scenario rather than naming a seed, because
// the drive that finds the water is a minute of held lock over open country
// and where it finishes moves with the roads and with the handling alike.
import { beforeAll, describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileStage,
  createGame,
  createLandField,
  step,
  type GameEvent,
  type GameState,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

/** What the two seed searches below are allowed to spend finding their
 * scenario. They scan a list of seeds for water that does a particular
 * thing to a car, and each candidate costs a minute of simulated driving —
 * so a scan that has to reach the tail is a couple of minutes of work.
 * Inside an `it` those minutes land against the suite's 30 s per-test
 * allowance, which turns a generator change that moves the leading seeds
 * into a RED test rather than a slow one: exactly what the wide tail is
 * there to prevent. In a hook, sized to the whole tail, it stays the few
 * seconds of scanning those lists promise. */
const SEARCH_ALLOWANCE = 300_000;

/** Off the road under full throttle and hard lock, until the car is in
 * water deep enough to be drowning in it. Returns the step that put it
 * there. The lakeland dial is turned up so there IS water to find, and the
 * lock decides WHICH side of the road it is found on — the two answer with
 * different shorelines, and both beats the water has are wanted.
 *
 * It is STAGED at the stretch of road nearest a lake rather than driven
 * from the grid. R35 sites a stage's start on ground clear of the water and
 * keeps the route back from it, so a car circling at full lock from the
 * start line now finds two hundred metres of guaranteed dry ground and
 * nothing else — the scenario stopped being about drowning and started
 * being about which seed happened to put a lake next to a start. */
function plunge(seed: number, steer: number): { state: GameState; entry: GameEvent[] } | null {
  const track = compileStage(seed, "long", { water: 1 });
  const land = createLandField(seed, track.knobs);
  let at = track.samples[0];
  let best = Infinity;
  for (let i = 0; i < track.samples.length; i += 5) {
    const s = track.samples[i];
    const near = land.water.nearestAt(s.x, s.z, 600);
    if (!near) continue;
    const d = Math.hypot(near.x - s.x, near.z - s.z);
    if (d < best) {
      best = d;
      at = s;
    }
  }
  const state = createGame({ seed, length: "long", skipCountdown: true, track });
  state.car.x = at.x;
  state.car.z = at.z;
  state.car.y = at.elevation;
  state.car.heading = at.heading;
  const input = { ...NEUTRAL_INPUT, throttle: 1, steer };
  for (let i = 0; i < TUNING.physicsHz * 60; i++) {
    const entry = step(state, input);
    if (state.drowning) return { state, entry };
  }
  return null;
}

describe("going under (TUNING.crash.drown)", () => {
  /** Seeds to look for a lake in, in order — these lead with ones whose
   * water is known to be deep enough to submerge a car, so the search below
   * usually stops at the first. It is an ORDER and not a guarantee:
   * `crash.deepWater` is a low bar a car meets in a puddle at a lakeshore,
   * and which shelf it ends up on is decided by the handling that carried
   * it there. `swallows` is what actually holds the scenario still. */
  // Led by seeds whose water is known to be deep enough, then a wider net:
  // which seeds put a drownable lake beside a road moves whenever the
  // generator's routing does, and a list of three is a fixture that breaks
  // every time the stages shift rather than a scenario that holds.
  const DROWNING_SEEDS = [9, 30, 11, 34, 26, ...SEEDS, 7, 12, 15, 17, 19, 22, 25, 28, 31, 36];

  /** ...and does that water actually close over the roof? The car sinks to
   * the BED (step.ts), so a shelf shallower than the roof leaves it settled
   * with its cabin in the air — a real outcome, and not the one these tests
   * are about. WHICH shelf it ends up on is decided by the handling that
   * carried it in there, so a scenario that does not check this silently
   * becomes a different scenario every time the car's cornering changes,
   * and "it went under, roof and all" starts failing on a car sitting in a
   * puddle. Run on a throwaway state; the drive is deterministic, so the
   * real one replays it exactly. */
  function swallows(seed: number): boolean {
    const attempt = plunge(seed, 1);
    if (!attempt) return false;
    const { state } = attempt;
    for (let i = 0; i < Math.round(TUNING.crash.drown.duration / TUNING.dt); i++) {
      if (state.drowning?.under) return true;
      step(state, NEUTRAL_INPUT);
    }
    return false;
  }

  /** Found once and reused — the answer cannot change within a run. */
  let deepSeed: number | undefined;

  beforeAll(() => {
    deepSeed = DROWNING_SEEDS.find(swallows);
  }, SEARCH_ALLOWANCE);

  function driveIntoDeepWater(): { state: GameState; entry: GameEvent[] } {
    if (deepSeed === undefined) throw new Error("no seed put deep enough water beside the road");
    const attempt = plunge(deepSeed, 1);
    if (!attempt) throw new Error(`seed ${deepSeed} no longer drowns the car`);
    return attempt;
  }

  it("holds the car in the water instead of teleporting it off the lake", () => {
    const { state, entry } = driveIntoDeepWater();
    const types = entry.map((e) => e.type);
    // The entry is a crash and a deep splash — and NOT a respawn, which is
    // the whole change: the run is lost, the car is still in the lake.
    expect(types).toContain("crash");
    expect(types).not.toContain("respawn");
    // A car that wades in off a shore books the shallows' splash and the
    // deep one on the SAME step, so the deep one is the one to look for
    // rather than the first one in the list.
    const splashes = entry.filter((e) => e.type === "splash");
    expect(splashes.some((e) => e.deep)).toBe(true);
    expect(state.drowning).not.toBeNull();
  });

  it("floats it at the waterline, then sinks it, and only then brings it home", () => {
    const { state } = driveIntoDeepWater();
    const D = TUNING.crash.drown;
    const waterY = state.drowning?.waterY ?? 0;
    const since = state.drowning?.since ?? 0;

    let sank = 0;
    let respawned = 0;
    let floatDepth = -Infinity;
    let deepest = Infinity;
    for (let i = 0; i < Math.round((D.duration + 0.5) / TUNING.dt); i++) {
      const age = state.t - since;
      // Through the float the hull rides its waterline: within half a metre
      // of the surface, bobbing, never gone.
      if (state.drowning && age > 0.9 && age < D.float) {
        floatDepth = Math.max(floatDepth, waterY - state.car.y);
      }
      if (state.drowning) deepest = Math.min(deepest, state.car.y);
      for (const ev of step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: -1 })) {
        if (ev.type === "sink") sank += 1;
        if (ev.type === "respawn") respawned += 1;
      }
    }
    // Under the surface, but only just: sills awash, not gone. The lower
    // bound also keeps the assertion from passing on a window the loop
    // never actually visited.
    expect(floatDepth).toBeGreaterThan(0);
    expect(floatDepth).toBeLessThan(D.draft + 0.5);
    // It went under once, roof and all...
    expect(sank).toBe(1);
    expect(deepest).toBeLessThan(waterY - D.roof);
    // ...and the crew arrived exactly once, at the far end.
    expect(respawned).toBe(1);
    expect(state.drowning).toBeNull();
  });

  it("ignores the driver for the whole penalty — the seconds are the point", () => {
    const { state } = driveIntoDeepWater();
    const D = TUNING.crash.drown;
    const raceAtEntry = state.raceTime;
    // Everything the panicking driver can reach, including the reset that
    // normally drags a wandering car home on the spot.
    const mashing = {
      ...NEUTRAL_INPUT,
      throttle: 1,
      brake: 1,
      handbrake: true,
      reset: true,
    };
    // Run the penalty out by STEPS rather than by comparing the clock to
    // it. Both the engine's own `age` and `state.t - since` out here are
    // differences of two accumulated floats, and after a stage's worth of
    // simulated seconds the last step of the penalty lands either side of
    // the bar depending on how far the car drove before it went in.
    let home = 0;
    let steps = 0;
    const bail = Math.round((D.duration + 1) / TUNING.dt);
    while (state.drowning && steps++ < bail) {
      for (const ev of step(state, mashing)) if (ev.type === "respawn" && state.drowning) home += 1;
    }
    // Not once in the whole penalty did the reset bring the car home: the
    // only respawn is the crew's, on the step the water finally let go.
    expect(home).toBe(0);
    expect(state.drowning).toBeNull();
    expect(steps).toBeLessThan(bail);
    // ...and the clock never stopped while it was ignoring them: the whole
    // penalty is charged to the run, which is what makes it one.
    expect(state.raceTime - raceAtEntry).toBeCloseTo(D.duration, 1);
  });
});

describe("driving out again (TUNING.crash.drown.shallows)", () => {
  /** Not every splash is a drowning. A car that clips a shore at pace
   * carries that entry back out of the water, and the failure these hold
   * off is the water keeping it anyway: the body held down at a waterline
   * the car has already driven past, which finishes the beat buried in the
   * beach it is standing on. */
  // WHICH seeds those are is not stable across generator changes and is not
  // meant to be: the drive that carries the car into the water is 60 s of
  // full lock off whatever road the seed built, so a stage whose road moves
  // puts the car in different water. R34 laid the roads along the country
  // and every one of them moved; R17's junction placement moved them again.
  // So the leading names are a shortcut, not the fixture: the tail is the
  // search SPACE, and it is wide on purpose so that a generator change
  // costs the suite a few seconds of scanning rather than a red test.
  const SHORE_SEEDS = [
    // 219 leads because it is the first that scrambles out — the drive that
    // finds the water is a minute of held lock over open country, so a car
    // that reaches a given shore is a car that has not rolled, wedged or
    // drowned on the way, and which seeds those are moves with the handling
    // as readily as with the roads. The names behind it are the rest of
    // that handful, so a road (or a roster) that moves under the leader
    // costs one more plunge rather than a scan of the tail.
    219,
    73,
    5,
    78,
    97,
    101,
    104,
    120,
    128,
    158,
    211,
    234,
    247,
    249,
    272,
    109,
    69,
    87,
    39,
    49,
    59,
    3,
    ...SEEDS,
    ...Array.from({ length: 60 }, (_, i) => 60 + i),
  ];

  /** Take a seed's plunge and run the drowning out. Reports the seed whose
   * shoreline the car drives back out of — which one that is depends on the
   * handling that carried it in, exactly as `swallows` does above, so this
   * searches rather than naming one.
   *
   * It asks EXACTLY what the tests below ask, under the same throttle, and
   * that is the whole point of it. A search that only checked whether the
   * seed beaches — on neutral input, which is not what the tests drive —
   * happily returned a shore the car crawls out of at 0.15 m/s and one it
   * drives straight back into a second later, and then the fixture was a
   * list of seed numbers somebody had to re-find by hand every time the
   * generator moved a road. */
  function scrambles([seed, steer]: Approach): boolean {
    const attempt = plunge(seed, steer);
    if (!attempt) return false;
    const { state } = attempt;
    const throttle = { ...NEUTRAL_INPUT, throttle: 1 };
    // The lock that found the water has already been driving off-road for
    // up to a minute, and the wedge rule may well have fetched the car
    // once on the way: what marks a car driving ITSELF out is a drowning
    // that ends without the crew, not a run with no respawns in it.
    const fetched = state.stats.respawns;
    let out = false;
    for (let i = 0; i < Math.round(TUNING.crash.drown.float / TUNING.dt); i++) {
      step(state, throttle);
      if (!state.drowning) {
        out = true;
        break;
      }
    }
    if (!out || state.stats.respawns !== fetched) return false;
    // ...and then it stays out, on the ground, driving — the second half of
    // the beat, and a different question from getting out at all.
    for (let i = 0; i < Math.round(1 / TUNING.dt); i++) {
      step(state, throttle);
      if (state.drowning) return false;
      if (state.terrain.groundAt(state.car.x, state.car.z) - state.car.y >= 0.05) return false;
    }
    return state.car.u > 1;
  }

  /** A seed and the lock the car goes looking for water on — the two halves
   * of the fixture, because BOTH of them decide where in the lake it ends
   * up. The list used to search only the first, and that was the bug: the
   * plunge is a minute of held lock across open country and a handling
   * change moves where it finishes as surely as a generator change does, so
   * a roster that slid less put every listed seed in water too deep to
   * drive out of and the fixture had nothing left to find. How HARD the car
   * turns in decides how far into the lake it gets, which is the cheaper
   * axis of the two — a gentler entry is a shallower one — so the search
   * walks it as well and the space is a couple of hundred times wider for
   * one more loop. */
  type Approach = [seed: number, steer: number];
  const APPROACHES: Approach[] = [-0.75, -1, -0.5, -0.35].flatMap((steer) =>
    SHORE_SEEDS.map((seed): Approach => [seed, steer]),
  );

  let shore: Approach | undefined;

  beforeAll(() => {
    shore = APPROACHES.find(scrambles);
  }, SEARCH_ALLOWANCE);

  function driveIntoTheShallows(): GameState {
    if (shore === undefined) throw new Error("no seed put a shore the car could drive back out of");
    const attempt = plunge(shore[0], shore[1]);
    if (!attempt) throw new Error(`seed ${shore[0]} no longer puts the car in the water`);
    return attempt.state;
  }

  it("gives the car back to the driver instead of the crew", () => {
    const state = driveIntoTheShallows();
    const D = TUNING.crash.drown;
    const respawnsAtEntry = state.stats.respawns;
    const progressAtEntry = state.progressS;

    let out = 0;
    let sank = 0;
    let steps = 0;
    const bail = Math.round(D.float / TUNING.dt);
    while (state.drowning && steps++ < bail) {
      for (const ev of step(state, { ...NEUTRAL_INPUT, throttle: 1 })) {
        if (ev.type === "respawn") out += 1;
        if (ev.type === "sink") sank += 1;
      }
    }
    // It got out while it was still afloat, on its own momentum: no crew,
    // no gulp, and the run is standing exactly where it left it rather than
    // back at the last split board.
    expect(state.drowning).toBeNull();
    expect(steps).toBeLessThan(bail);
    expect(out).toBe(0);
    expect(sank).toBe(0);
    expect(state.stats.respawns).toBe(respawnsAtEntry);
    expect(state.progressS).toBe(progressAtEntry);
  });

  it("stands it on the ground it beached on, not under it", () => {
    const state = driveIntoTheShallows();
    while (state.drowning) step(state, { ...NEUTRAL_INPUT, throttle: 1 });

    // The one that reads as a broken game: a car that drove out and then
    // spends the rest of the beat sinking through the bank it is standing
    // on. Give it a second of driving and it must be ON the ground the
    // whole way — the seat can stand it above a dip under its middle, never
    // below it.
    let buried = -Infinity;
    for (let i = 0; i < Math.round(1 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      buried = Math.max(buried, state.terrain.groundAt(state.car.x, state.car.z) - state.car.y);
    }
    expect(buried).toBeLessThan(0.05);
    // ...and it is DRIVING: the throttle reaches it again, which is the one
    // thing the drowning takes away.
    expect(state.car.u).toBeGreaterThan(1);
    expect(state.drowning).toBeNull();
  });

  it("asks for shallower water than the depth that took the car", () => {
    // The bar to get out sits UNDER the bar that put the car in, and it has
    // to: on the same bar a hull bobbing at the deep-water line would beach
    // and drown again on alternate steps.
    expect(TUNING.crash.drown.shallows).toBeGreaterThan(0);
    expect(TUNING.crash.drown.shallows).toBeLessThan(TUNING.crash.deepWater);
  });
});
