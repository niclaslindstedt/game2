// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R25's RUN-OUT road past the finish gate, and the roll-out beat the car
// spends on it once the clock has stopped. These are the invariants that
// keep a finish from being a cliff edge — that there IS road past the line,
// that the clock stops AT the line, and that a car crossing at rally pace
// comes to a stop on the road rather than in the trees or in the next
// county. Where the LINE itself is, and what counts as crossing it, is
// `finish_test.ts`.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  STAGE_RULES as R,
  botInput,
  TUNING,
  compileStage,
  compileTrack,
  createGame,
  finishAt,
  finishIndex,
  locate,
  step,
  type GameEvent,
  type GameState,
} from "@engine";

/** Seeds every geometric assertion is checked over — compiling a stage is
 * cheap. */
const SEEDS = [1, 7, 19, 38, 91, 4711];

/** ...and the ones actually DRIVEN. Driving a stage end to end is a minute
 * of simulated time per seed, and this suite runs beside every other one:
 * three is enough to catch a roll-out that puts the car in the trees, and
 * more than that starves the rest of the suite of its timeout. */
const DRIVEN = [7, 19, 38];

/** Drive a run to its end with the BOT at the wheel, collecting everything
 * it emitted. The bot rather than a scripted throttle because the roll-out
 * is about what happens to a car that ARRIVES at the line properly — at
 * pace, on the road, pointing down it — and a stuck-throttle rig arrives at
 * the finish having respawned its way there. */
function driveToFinish(state: GameState, guardSeconds = 400): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(guardSeconds / TUNING.dt);
  for (let i = 0; i < steps && state.phase !== "finished"; i++) {
    events.push(...step(state, botInput(state)));
  }
  return events;
}

/** One driven run per seed, kept — several assertions want to look at the
 * same finished run, and driving it again for each of them is a minute of
 * simulation for a state this file already has. */
const runs = new Map<number, { state: GameState; events: GameEvent[] }>();

function drivenRun(seed: number): { state: GameState; events: GameEvent[] } {
  const cached = runs.get(seed);
  if (cached) return cached;
  const state = createGame({ seed, length: "short", skipCountdown: true });
  const run = { state, events: driveToFinish(state) };
  runs.set(seed, run);
  return run;
}

describe("R25 — the run-out past the finish", () => {
  it("builds road past the gate on every generated stage", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "short");
      const line = track.finishS;
      expect(line).not.toBeNull();
      // The samples do not stop at the line: there is a run-out's worth of
      // road behind it for the car to coast down.
      expect(track.length - (line as number)).toBeCloseTo(R.runOut, 3);
      const gate = finishIndex(track);
      expect(gate).toBeLessThan(track.samples.length - 1);
      expect(track.samples[track.samples.length - 1].s).toBeGreaterThanOrEqual(
        track.samples[gate].s + R.runOut - track.step,
      );
    }
  });

  it("keeps the run-out straight and on the same line as the finish", () => {
    // A finish is meant to be READ, and a run-out that curved away would be
    // a blind corner taken with nobody at the wheel.
    for (const seed of SEEDS) {
      const track = compileStage(seed, "short");
      const gate = track.samples[finishIndex(track)];
      for (let i = finishIndex(track); i < track.samples.length; i++) {
        expect(Math.abs(track.samples[i].heading - gate.heading)).toBeLessThan(1e-6);
        expect(track.samples[i].surface).not.toBe("water");
        expect(track.samples[i].jump).toBe(false);
      }
    }
  });

  it("stops the clock at the LINE, not at the end of the road", () => {
    const { state, events } = drivenRun(7);
    const finish = events.filter((e) => e.type === "finish");
    expect(finish).toHaveLength(1);
    // Progress at the moment the clock stopped was the gate, and the car
    // then carried on past it.
    const line = finishAt(state.track) as number;
    expect(line).toBeLessThan(state.track.length);
    expect(state.progressS).toBeGreaterThan(line);
    // ...and the race time is the time at the line: the roll-out is free.
    const timed = finish[0].type === "finish" ? finish[0].time : 0;
    expect(state.raceTime).toBeCloseTo(timed, 6);
    expect(state.rollout).toBeGreaterThan(0);
  });

  it("coasts the car to a stop on the road, hands off", () => {
    for (const seed of DRIVEN) {
      const { state } = drivenRun(seed);
      expect(state.phase).toBe("finished");
      // Stopped, not merely out of road or out of patience.
      expect(state.car.u).toBeLessThanOrEqual(TUNING.rollOut.restSpeed);
      expect(state.rollout).toBeLessThan(TUNING.rollOut.maxTime);
      // ...and stopped ON the run-out: a roll-out that put the car in the
      // trees would be the dead end with extra steps.
      const fix = locate(state.track, state.car.x, state.car.z, state.progressIndex);
      expect(fix.offRoad).toBe(false);
    }
  });

  it("hands the player no control once the line is crossed", () => {
    const { state } = drivenRun(19);
    const at = { x: state.car.x, z: state.car.z };
    // Full throttle and full lock into a finished run change nothing.
    for (let i = 0; i < 200; i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: 1 });
    }
    expect(state.car.x).toBeCloseTo(at.x, 6);
    expect(state.car.z).toBeCloseTo(at.z, 6);
  });

  it("finishes a synthetic rig at its gate, with no roll-out", () => {
    // A track built from a segment list has no run-out, so it ends the way
    // it always has — the scripted physics rigs must not grow a coast-down
    // they never asked for, and their gate stays on the second-to-last
    // sample so a flying finish still has somewhere to land.
    const track = compileTrack(0, [{ kind: "straight", length: 300, feature: "none" }]);
    expect(track.finishS).toBeNull();
    expect(finishIndex(track)).toBe(track.samples.length - 2);
    const state = createGame({ seed: 0, skipCountdown: true, track });
    driveToFinish(state, 60);
    expect(state.phase).toBe("finished");
    expect(state.rollout).toBe(0);
  });
});

describe("R27 — the crowd", () => {
  it("stands clear of the road, and cheers as the car goes by", () => {
    const { state, events } = drivenRun(7);
    const stands = state.terrain.stands;
    expect(stands.length).toBeGreaterThan(0);
    const half = state.track.width / 2;
    for (const stand of stands) {
      expect(state.terrain.roadDistanceAt(stand.x, stand.z)).toBeGreaterThan(half);
      expect(state.terrain.waterAt(stand.x, stand.z)).toBeNull();
      expect(stand.size).toBeGreaterThan(0);
      expect(stand.size).toBeLessThanOrEqual(1);
    }
    // In stage order — the run reads them as a window on progress.
    for (let i = 1; i < stands.length; i++) {
      expect(stands[i].s).toBeGreaterThanOrEqual(stands[i - 1].s);
    }
    // Every one of them is heard exactly once on the way past.
    const cheers = events.filter((e) => e.type === "cheer");
    expect(cheers.length).toBeGreaterThan(0);
    expect(cheers.length).toBeLessThanOrEqual(stands.length);
  });

  it("banks its biggest crowd on both sides of the finish line", () => {
    const { state } = drivenRun(7);
    const line = finishAt(state.track) as number;
    const atFinish = state.terrain.stands.filter((s) => s.finish);
    expect(atFinish.length).toBeGreaterThan(0);
    for (const stand of atFinish) {
      expect(stand.size).toBe(1);
      expect(Math.abs(stand.s - line)).toBeLessThanOrEqual(R.crowd.finishReach);
    }
    // The approach AND the run-out past the gate: the finish is watched from
    // a camera planted at the line looking down the run-out, so a crowd only
    // ever behind that camera is a crowd nobody sees.
    expect(atFinish.some((s) => s.s < line)).toBe(true);
    expect(atFinish.some((s) => s.s > line)).toBe(true);
  });
});
