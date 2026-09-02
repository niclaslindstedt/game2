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
  knobs: { elevation: 0.5, steepness: 0.5, water: 0.5, trees: 0.5, asphalt: 0.25, width: 0.55 },
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
    // A HARD field, and the difficulty is the fixture rather than a detail:
    // it is the one where the bot's own run is quick enough that no crew
    // ever shares road with it. That is the precondition the claim below
    // needs — a crew that CATCHES the player sees it in its traffic and
    // drives around it, so the crew that raced is not the crew the
    // standalone placing simulates, and on this stage a medium run is slow
    // enough for exactly that to happen (place 13 raced against 12 placed).
    const recorded = recordBotRun({ difficulty: "hard", cars: 15 });
    const placed = placeAmongField({
      stage: STAGE,
      field: { difficulty: "hard", cars: 15, massStart: false },
      time: recorded.time,
      carId: CAR.id,
    });
    // The same time, against the same field, placed the same way — nobody
    // met anybody, so racing them alone and racing them with somebody out
    // there gives one answer.
    expect(placed.place).toBe(recorded.place);
    expect(placed.of).toBe(recorded.of);
    expect(placed.rows.filter((row) => row.you).length).toBe(1);
  });

  it("gets harder as the difficulty climbs", () => {
    // Over several stages rather than one, because one crew putting it in
    // the trees on one road is a real event and a single seed reads that
    // coin-flip as a broken ladder. The claim is about the ladder, so it is
    // asked of the ladder — several roads at once, where one crew's bad
    // afternoon cannot carry it.
    //
    // Measured as a GAP IN SECONDS to the field's median, and not as the
    // recorded lap's integer PLACE, because place has almost no resolution
    // where this lap lands. A bot's own lap comes home in the last third of
    // its own field; down there the crews are seconds apart and a whole
    // step of the ladder — measured at 62.2 s / 58.0 s / 56.2 s median over
    // six roads — is worth a place or none at all, at random. The ladder was
    // healthy on every one of those measurements while this assertion read
    // 38 against 37 and called it broken. Seconds are what the difficulty
    // actually moves; places are what that buys, and only where the field is
    // close enough for a second to be worth one.
    const gaps = [0, 0, 0];
    for (const seed of [42, 7, 21]) {
      const stage = { ...STAGE, seed };
      const recorded = race({
        stage,
        car: CAR,
        field: { difficulty: "medium" as const, cars: 15, massStart: false },
        start: START,
        driver: { kind: "bot" as const },
      });
      (["easy", "medium", "hard"] as const).forEach((difficulty, i) => {
        const { rows } = placeAmongField({
          stage,
          field: { difficulty, cars: 15, massStart: false },
          time: recorded.time,
          carId: CAR.id,
        });
        // The field's own median time, the driver's row left out of it: the
        // pace of the crews the lap is being measured against.
        const field = rows
          .filter((row) => !row.you && row.time !== null)
          .map((row) => row.time as number)
          .sort((a, b) => a - b);
        expect(field.length).toBeGreaterThan(8);
        gaps[i] += recorded.time - field[Math.floor(field.length / 2)];
      });
    }
    // The same lap is worth LESS against a better field — it stands further
    // behind the crews it is being measured against. This is the assertion
    // the whole calibration rests on: if it ever fails, the difficulty
    // ladder has stopped being a ladder.
    expect(gaps[0]).toBeLessThan(gaps[1]);
    expect(gaps[1]).toBeLessThan(gaps[2]);
    // Three roads and three fields of fourteen is a hundred and twenty-six
    // stages driven for one assertion — worth it for the one the whole
    // calibration rests on, but not inside the default budget.
  }, 60_000);

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
