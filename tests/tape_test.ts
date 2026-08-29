// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run tape: a whole run written down as the controls that drove it, and
// driven again. The property that matters is the one the whole tool rests
// on — a tape put back on the road drives the SAME metre of road — so that
// is what most of this file asserts, in the two ways it can go wrong: the
// format losing something on the way through, and the replay stepping the
// world in a different order from the run it recorded.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TAPE_FORMAT,
  createTapeRecorder,
  createGame,
  parseTape,
  placeAmongField,
  race,
  readTape,
  step,
  type CarInput,
  type TapeStage,
} from "@engine";

const STAGE: TapeStage = {
  seed: 42,
  length: "short",
  shape: "sprint",
  laps: 1,
  knobs: { elevation: 0.5, water: 0.5, trees: 0.5, asphalt: 0.25, width: 0.55 },
  timeOfDay: "day",
  weather: "clear",
  season: "summer",
};

const CAR = { id: "compact", gearbox: "auto" as const };
const START = { skipCountdown: true, grid: null };

/** A bot run, recorded — the fixture every replay assertion works off. */
function recordBotRun(field: { difficulty: "easy" | "medium" | "hard"; cars: number } | null) {
  return race({
    stage: STAGE,
    car: CAR,
    field: field ? { ...field, massStart: false } : null,
    start: START,
    driver: { kind: "bot" },
    record: { source: "bot", mode: "sim" },
  });
}

describe("the run tape", () => {
  it("round-trips every control through the file", () => {
    const recorder = createTapeRecorder({
      engine: "test",
      recorded: new Date(0).toISOString(),
      source: "bot",
      mode: "sim",
      stage: STAGE,
      car: CAR,
      field: null,
      start: START,
    });
    // A car that is not moving still has a state to sample; what is under
    // test here is the controls, not the physics.
    const state = createGame({ seed: STAGE.seed, carId: CAR.id, length: "short", quiet: true });
    const script: CarInput[] = [
      { ...NEUTRAL_INPUT, throttle: 1 },
      { ...NEUTRAL_INPUT, throttle: 1 },
      { ...NEUTRAL_INPUT, throttle: 0.5, steer: -0.4409448818897638, brake: 0.25 },
      { ...NEUTRAL_INPUT, handbrake: true, shiftUp: true },
      { ...NEUTRAL_INPUT, shiftDown: true, reset: true },
    ];
    for (const input of script) recorder.record(input, state);
    const tape = parseTape(
      recorder.seal(
        {
          finished: true,
          time: 1,
          laps: 1,
          lapTimes: [1],
          splits: [],
          place: null,
          of: null,
          stats: state.stats,
        },
        [],
      ),
    );
    expect(tape.header.format).toBe(TAPE_FORMAT);
    // Held controls cost no lines: two identical steps are one entry.
    expect(tape.inputs.length).toBe(4);
    const player = readTape(tape);
    script.forEach((input, i) => {
      const back = player.at(i);
      expect(back.steer, `step ${i} steer`).toBe(input.steer);
      expect(back.throttle, `step ${i} throttle`).toBe(input.throttle);
      expect(back.brake, `step ${i} brake`).toBe(input.brake);
      expect(back.handbrake, `step ${i} handbrake`).toBe(input.handbrake);
      expect(back.shiftUp, `step ${i} shiftUp`).toBe(input.shiftUp);
      expect(back.shiftDown, `step ${i} shiftDown`).toBe(input.shiftDown);
      expect(back.reset, `step ${i} reset`).toBe(input.reset);
    });
    // Past the end is a car sat past a finish it has already crossed.
    expect(player.at(script.length).throttle).toBe(0);
  });

  it("refuses a file that is not a tape, and one from another format", () => {
    expect(() => parseTape("")).toThrow(/no header/);
    expect(() => parseTape("not json\n")).toThrow(/not JSON/);
    expect(() => parseTape('{"kind":"run","format":999,"dt":0.008333333333333333}\n')).toThrow(
      /format 999/,
    );
  });

  it("replays a recorded run onto the same metre of road", () => {
    const recorded = recordBotRun(null);
    expect(recorded.finished).toBe(true);
    const tape = parseTape(recorded.tape as string);
    const replayed = race({
      stage: STAGE,
      car: CAR,
      field: null,
      start: START,
      driver: { kind: "tape", tape },
    });
    expect(replayed.finished).toBe(true);
    // The same physics, handed the same inputs, in the same order: the clock
    // agrees to the step and the car never leaves the recorded line. The
    // sample tolerance is the rounding the file writes them at, not slack.
    expect(replayed.time).toBeCloseTo(recorded.time, 6);
    expect(replayed.drift?.samples).toBe(tape.samples.length);
    expect(replayed.drift?.worst).toBeLessThan(0.02);
  });

  it("replays a run that had a field beside it, contact and all", () => {
    const recorded = recordBotRun({ difficulty: "medium", cars: 15 });
    const tape = parseTape(recorded.tape as string);
    expect(tape.header.field?.difficulty).toBe("medium");
    // The classification the run produced travels with it — that is what
    // makes a tape a calibration artifact and not only a replay.
    expect(tape.rivals.length).toBe(14);
    expect(tape.result?.place).toBe(recorded.place);
    const replayed = race({
      stage: STAGE,
      car: CAR,
      field: tape.header.field,
      start: START,
      driver: { kind: "tape", tape },
    });
    expect(replayed.time).toBeCloseTo(recorded.time, 6);
    expect(replayed.place).toBe(recorded.place);
    expect(replayed.drift?.worst).toBeLessThan(0.02);
  });

  it("places a time against a field without putting a car on the road", () => {
    const recorded = recordBotRun({ difficulty: "medium", cars: 15 });
    const placed = placeAmongField({
      stage: STAGE,
      field: { difficulty: "medium", cars: 15, massStart: false },
      time: recorded.time,
      carId: CAR.id,
    });
    // The same time, against the same field, placed the same way — the
    // crews are never resolved against each other, so racing them alone and
    // racing them with somebody out there gives one answer.
    expect(placed.place).toBe(recorded.place);
    expect(placed.of).toBe(recorded.of);
    expect(placed.rows.filter((row) => row.you).length).toBe(1);
  });

  it("gets harder as the difficulty climbs", () => {
    const recorded = recordBotRun({ difficulty: "medium", cars: 15 });
    const places = (["easy", "medium", "hard"] as const).map(
      (difficulty) =>
        placeAmongField({
          stage: STAGE,
          field: { difficulty, cars: 15, massStart: false },
          time: recorded.time,
          carId: CAR.id,
        }).place,
    );
    // The same lap is worth no better a place against a better field. This
    // is the assertion the whole calibration rests on: if it ever fails, the
    // difficulty ladder has stopped being a ladder.
    expect(places[0]).toBeLessThanOrEqual(places[1]);
    expect(places[1]).toBeLessThanOrEqual(places[2]);
  });

  it("writes down the cut establishing shot, because it moves the field", () => {
    const recorder = createTapeRecorder({
      engine: "test",
      recorded: new Date(0).toISOString(),
      source: "player",
      mode: "campaign",
      stage: STAGE,
      car: CAR,
      field: null,
      start: { skipCountdown: false, grid: null },
    });
    const state = createGame({ seed: STAGE.seed, carId: CAR.id, length: "short", quiet: true });
    recorder.record(NEUTRAL_INPUT, state);
    step(state, NEUTRAL_INPUT);
    recorder.skipped();
    recorder.record(NEUTRAL_INPUT, state);
    const tape = parseTape(
      recorder.seal(
        {
          finished: false,
          time: 0,
          laps: 1,
          lapTimes: [],
          splits: [],
          place: null,
          of: null,
          stats: state.stats,
        },
        [],
      ),
    );
    expect(tape.skips).toEqual([1]);
    expect(readTape(tape).skipsAt(1)).toBe(true);
    expect(readTape(tape).skipsAt(0)).toBe(false);
  });
});
