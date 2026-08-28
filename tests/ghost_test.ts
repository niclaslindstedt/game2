// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ghost's load-bearing claim: a run kept as the CONTROLS that drove it
// puts the car back through the same metre of road when it is played again.
//
// That only holds while two things are true, and both are asserted here.
// The engine has to be deterministic — same seed, same car, same inputs,
// same run — and the tape has to write down exactly what the engine
// received, which is why the app snaps the wheel and the pedals onto the
// tape's own grid before handing them over (snapSteer/snapPedal, applied in
// input.ts). Break either and a ghost drives off the road a corner later,
// silently, in a build nobody tested for four minutes.
//
// This test imports from pwa/ because that is where the recorder lives, and
// it can: the tape is pure arithmetic — no three.js, no DOM.

import { describe, expect, it } from "vitest";

import { TUNING, botInput, compileStage, createGame, step, type CarInput } from "@engine";

import {
  createGhostRecorder,
  ghostMatches,
  readGhost,
  snapPedal,
  snapSteer,
  type GhostStage,
} from "../pwa/src/game/ghost.ts";

const STAGE: GhostStage = {
  seed: 38,
  length: "short",
  knobs: { elevation: 0.5, water: 0.5, trees: 0.5, asphalt: 0.5, width: 0.5 },
  timeOfDay: "day",
  weather: "clear",
};

/** What the app's input manager hands the engine: every axis already on the
 * tape's grid. The bot steers in full float precision, so a test that fed it
 * straight in would be measuring a path the player's controls can never
 * produce. */
function throughTheWheel(input: CarInput): CarInput {
  return {
    ...input,
    steer: snapSteer(input.steer),
    throttle: snapPedal(input.throttle),
    brake: snapPedal(input.brake),
  };
}

/** How long a short stage is allowed to take before the test gives up, s. */
const PATIENCE = 240;

describe("ghost tape", () => {
  it("replays a whole stage onto the same road, step for step", () => {
    const track = compileStage(STAGE.seed, STAGE.length, STAGE.knobs);
    const game = createGame({ seed: STAGE.seed, carId: "compact", track });
    const recorder = createGhostRecorder();
    /** The driven line, sampled a second apart — a digest that says WHERE a
     * divergence started rather than only that one happened. */
    const line: number[] = [];
    let time: number | null = null;
    for (let i = 0; i < PATIENCE / TUNING.dt && time === null; i++) {
      const input = throughTheWheel(botInput(game));
      recorder.record(input);
      for (const ev of step(game, input)) if (ev.type === "finish") time = ev.time;
      if (i % 120 === 0) line.push(game.car.x, game.car.z, game.car.heading);
    }
    expect(time).not.toBeNull();
    expect(recorder.steps()).toBe(Math.round(game.t / TUNING.dt));

    const run = recorder.seal(STAGE, "compact", time as number, game.checkpointTimes);
    const tape = readGhost(run);
    expect(tape.steps).toBe(recorder.steps());
    // R28 — the splits ride on the tape rather than being read back off the
    // replay: a run is measured against them from the first board, long
    // before the ghost's own car has reached it.
    expect(run.splits).toEqual(game.checkpointTimes);
    expect(run.splits.length).toBe(track.checkpoints.length);

    const replay = createGame({ seed: STAGE.seed, carId: "compact", track });
    const replayLine: number[] = [];
    let replayTime: number | null = null;
    for (let i = 0; i < tape.steps; i++) {
      for (const ev of step(replay, tape.at(i))) if (ev.type === "finish") replayTime = ev.time;
      if (i % 120 === 0) replayLine.push(replay.car.x, replay.car.z, replay.car.heading);
    }
    expect(replayLine).toEqual(line);
    expect(replayTime).toBe(time);
    // The tape ends at the LINE, so both runs are wherever crossing it left
    // them — coasting down R22's run-out on a generated stage. What a ghost
    // has to prove is that the replay ended up in the same place as the run
    // it recorded, not which place that is.
    expect(replay.phase).toBe(game.phase);
    expect(replay.car.x).toBe(game.car.x);
    expect(replay.car.z).toBe(game.car.z);
    expect(replay.stats.driftCount).toBe(game.stats.driftCount);
    expect(replay.car.damage.wear).toBe(game.car.damage.wear);
  });

  it("keeps a stage's worth of controls inside a storage budget", () => {
    const track = compileStage(STAGE.seed, STAGE.length, STAGE.knobs);
    const game = createGame({ seed: STAGE.seed, carId: "compact", track });
    const recorder = createGhostRecorder();
    for (let i = 0; i < PATIENCE / TUNING.dt; i++) {
      const input = throughTheWheel(botInput(game));
      recorder.record(input);
      if (step(game, input).some((ev) => ev.type === "finish")) break;
    }
    const sealed = JSON.stringify(
      recorder.seal(STAGE, "compact", game.raceTime, game.checkpointTimes),
    );
    // Four ghosts share one localStorage origin (~5 MB at two bytes a char),
    // and the ladder's longest stage is about seven times this one, so a
    // whole board has to live inside a couple of characters per step. A
    // driven stage measures around ONE — a control that is not moving costs
    // two bytes per 255 steps — and the budget here is what says so if the
    // run-length coding is ever dropped or defeated.
    expect(sealed.length).toBeLessThan(2 * recorder.steps());
  });

  it("holds every control across the codec, held or changing every step", () => {
    const recorder = createGhostRecorder();
    const driven: CarInput[] = [];
    for (let i = 0; i < 900; i++) {
      const input: CarInput = {
        // A long hold, then a value that moves every single step: the two
        // ends of what run-length coding has to survive.
        steer: snapSteer(i < 400 ? 0.5 : Math.sin(i * 0.31)),
        throttle: snapPedal(i < 400 ? 1 : (i % 256) / 255),
        brake: snapPedal(i % 7 === 0 ? 0.5 : 0),
        handbrake: i % 3 === 0,
        boost: i > 700,
        shiftUp: i === 123,
        shiftDown: i === 456,
        reset: i === 789,
      };
      driven.push(input);
      recorder.record(input);
    }
    const tape = readGhost(recorder.seal(STAGE, "compact", 12.5, []));
    expect(tape.steps).toBe(driven.length);
    for (let i = 0; i < driven.length; i++) {
      expect({ ...tape.at(i) }).toEqual(driven[i]);
    }
  });

  it("refuses a run recorded on a stage that is no longer this one", () => {
    const run = createGhostRecorder().seal(STAGE, "compact", 30, []);
    expect(ghostMatches(run, STAGE)).toBe(true);
    expect(ghostMatches(run, { ...STAGE, seed: STAGE.seed + 1 })).toBe(false);
    expect(ghostMatches(run, { ...STAGE, length: "long" })).toBe(false);
    expect(ghostMatches(run, { ...STAGE, weather: "storm" })).toBe(false);
    expect(ghostMatches(run, { ...STAGE, timeOfDay: "night" })).toBe(false);
    expect(ghostMatches(run, { ...STAGE, knobs: { ...STAGE.knobs, water: 0.9 } })).toBe(false);
  });
});
