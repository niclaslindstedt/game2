// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R28 — the split boards: where the generator puts them, when the run books
// one, and where a car that gave up is put back on the road.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  STAGE_RULES,
  TUNING,
  boardHalfWidth,
  botInput,
  compileStage,
  compileTrack,
  createGame,
  crossedGate,
  finishAt,
  lastCheckpoint,
  step,
  type CarInput,
  type SegmentPlan,
} from "@engine";

const C = STAGE_RULES.checkpoint;
/** The target gap between boards in METERS — the rule is quoted in seconds
 * of driving at the measured bot pace. */
const GAP = C.spacing * C.pace;
const SEEDS = [1, 2, 3, 7, 42, 99, 313];

/** The corner (or combination) the co-driver called last before `s`. */
function cornerBefore(track: ReturnType<typeof compileStage>, s: number) {
  let note = null;
  for (const n of track.pacenotes) {
    if (n.endS > s + 0.5) break;
    note = n;
  }
  return note;
}

describe("checkpoint placement", () => {
  it("splits every finite stage into boards roughly the target gap apart", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium");
      expect(track.checkpoints.length).toBeGreaterThan(3);
      let prev = 0;
      for (const board of track.checkpoints) {
        const gap = board.s - prev;
        // No board inside the early bar, and none so far past the target
        // that the stage went a whole extra split without one.
        expect(gap).toBeGreaterThanOrEqual(GAP * C.early - 1);
        expect(gap).toBeLessThan(GAP * 2.6);
        prev = board.s;
      }
    }
  });

  it("stands every board on the exit of a corner, and prefers the tight ones", () => {
    let tight = 0;
    let total = 0;
    let forced = 0;
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long");
      let prev = 0;
      for (const board of track.checkpoints) {
        const note = cornerBefore(track, board.s);
        const onExit = note !== null && board.s - note.endS <= C.runOut + track.step;
        // R28 — or the road has simply gone too long without a split and a
        // board has gone down where it got to (`checkpoint.forced`). R17's
        // borrowed tarmac sweeps, so a kilometre of it offers no corner to
        // hang one on, and a stage the clock has no shape to is worse than
        // a board on a straight.
        if (!onExit) {
          expect(board.s - prev, `seed ${seed}: board off a corner exit`).toBeGreaterThanOrEqual(
            C.spacing * C.pace * C.forced - track.step,
          );
          forced += 1;
          prev = board.s;
          continue;
        }
        prev = board.s;
        total += 1;
        if ((note as { severity: string }).severity !== "soft") tight += 1;
      }
    }
    // The exception stays one: most boards are still a corner's reward.
    expect(forced).toBeLessThan(total / 4);
    expect(total).toBeGreaterThan(50);
    // "Prefer tight corners" is a claim about the mix, so measure it: a soft
    // bend only ever gets a board when the stage has run well past its gap.
    expect(tight / total).toBeGreaterThan(0.9);
    // Seven LONG stages: a hilly seed's search backtracks against R23's
    // height clause, and under the whole suite's load the seven run past
    // the default thirty seconds.
  }, 120_000);

  it("keeps the boards on the samples they name, and clear of the finish gate", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium");
      const gate = finishAt(track) as number;
      for (const board of track.checkpoints) {
        expect(track.samples[board.index].s).toBe(board.s);
        expect(board.s).toBeLessThanOrEqual(gate - C.finishClear);
      }
    }
  });
});

/** Drive a scripted stage until `done`, or until the step budget runs out. */
function drive(
  state: ReturnType<typeof createGame>,
  input: (state: ReturnType<typeof createGame>) => CarInput,
  done: (state: ReturnType<typeof createGame>) => boolean,
  seconds = 120,
): number {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    step(state, input(state));
    if (done(state)) return i;
  }
  return -1;
}

describe("checking in", () => {
  it("books a split with the race clock as the car drives through", () => {
    const state = createGame({ seed: 42, length: "medium", skipCountdown: true });
    const boards = state.track.checkpoints.length;
    expect(boards).toBeGreaterThan(3);
    const times: number[] = [];
    const steps = Math.round(200 / TUNING.dt);
    for (let i = 0; i < steps && state.checkpointsPassed < 3; i++) {
      for (const ev of step(state, botInput(state))) {
        if (ev.type !== "checkpoint") continue;
        expect(ev.index).toBe(times.length);
        expect(ev.count).toBe(boards);
        times.push(ev.time);
      }
    }
    expect(times).toHaveLength(3);
    expect(state.checkpointTimes).toEqual(times);
    // A split is the race clock, so they only ever climb.
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
  });

  it("re-arms every board each lap of a circuit, on one running list", () => {
    const state = createGame({
      seed: 3,
      length: "short",
      shape: "circuit",
      laps: 2,
      skipCountdown: true,
    });
    const boards = state.track.checkpoints.length;
    expect(boards).toBeGreaterThan(0);
    const lapIndex: number[] = [];
    const splitIndex: number[] = [];
    const steps = Math.round(400 / TUNING.dt);
    for (let i = 0; i < steps && state.lap < 2; i++) {
      for (const ev of step(state, botInput(state))) {
        if (ev.type !== "checkpoint") continue;
        lapIndex.push(ev.index);
        splitIndex.push(ev.split);
      }
    }
    // Round onto the second lap and through its first board.
    for (let i = 0; i < steps && splitIndex.length <= boards; i++) {
      for (const ev of step(state, botInput(state))) {
        if (ev.type !== "checkpoint") continue;
        lapIndex.push(ev.index);
        splitIndex.push(ev.split);
      }
    }
    expect(state.lap).toBe(2);
    // The LAP index starts again; the SPLIT index runs on, which is what
    // keeps lap two measured against lap two of whatever it is chasing.
    expect(lapIndex.slice(0, boards)).toEqual(Array.from({ length: boards }, (_, i) => i));
    expect(lapIndex[boards]).toBe(0);
    expect(splitIndex.slice(0, boards + 1)).toEqual(
      Array.from({ length: boards + 1 }, (_, i) => i),
    );
    expect(state.checkpointTimes).toHaveLength(splitIndex.length);
  });

  it("never books the same board twice, respawn or not", () => {
    const state = createGame({ seed: 42, length: "medium", skipCountdown: true });
    const steps = Math.round(300 / TUNING.dt);
    const indices: number[] = [];
    // One press of the way-home button once the second board is behind us:
    // it drops the car back ON that board, and driving off it again must
    // not book it a second time.
    let asked = false;
    for (let i = 0; i < steps && indices.length < 3; i++) {
      const reset = indices.length === 2 && !asked;
      if (reset) asked = true;
      for (const ev of step(state, { ...botInput(state), reset })) {
        if (ev.type === "checkpoint") indices.push(ev.index);
      }
    }
    expect(asked).toBe(true);
    expect(indices).toEqual([0, 1, 2]);
  });
});

describe("where a respawn lands", () => {
  /** A rig with a long opening straight and a hairpin, so a board is earned
   * partway down a road the car can be driven off at will. */
  const RIG: SegmentPlan[] = [
    { kind: "straight", length: 600, feature: "none" },
    { kind: "turn", length: 40, dir: 1, radius: 18, severity: "hard", feature: "none" },
    { kind: "straight", length: 600, feature: "none" },
  ];

  it("puts a car that gives up back at its last board, progress and all", () => {
    const track = compileTrack(7, RIG);
    expect(track.checkpoints).toHaveLength(1);
    const board = track.checkpoints[0];
    const state = createGame({ seed: 7, track, skipCountdown: true });
    // Drive past the board, then ask for the way home.
    const at = drive(state, botInput, (s) => s.progressS > board.s + 100);
    expect(at).toBeGreaterThan(0);
    expect(state.checkpointsPassed).toBe(1);
    step(state, { ...NEUTRAL_INPUT, reset: true });
    expect(state.car.x).toBeCloseTo(track.samples[board.index].x, 3);
    expect(state.car.z).toBeCloseTo(track.samples[board.index].z, 3);
    // Progress comes back with the car — the road between is road to drive
    // again, not road the run keeps.
    expect(state.progressIndex).toBe(board.index);
    expect(state.progressS).toBeCloseTo(board.s, 3);
    // ...and the board it is standing on stays booked.
    expect(state.checkpointsPassed).toBe(1);
  });

  it("puts a car that has passed no board back on the start line", () => {
    const track = compileTrack(7, RIG);
    const state = createGame({ seed: 7, track, skipCountdown: true });
    const grid = { x: state.car.x, z: state.car.z };
    expect(drive(state, botInput, (s) => s.progressS > 200)).toBeGreaterThan(0);
    expect(state.checkpointsPassed).toBe(0);
    expect(lastCheckpoint(state).index).toBe(0);
    step(state, { ...NEUTRAL_INPUT, reset: true });
    expect(state.car.x).toBeCloseTo(grid.x, 3);
    expect(state.car.z).toBeCloseTo(grid.z, 3);
    expect(state.progressS).toBe(track.samples[0].s);
  });
});

describe("the stage is all of its boards", () => {
  /** Long enough either side of its hairpin that a board goes down on the
   * exit and there is still road to the flying finish afterwards. */
  const RIG: SegmentPlan[] = [
    { kind: "straight", length: 600, feature: "none" },
    { kind: "turn", length: 40, dir: 1, radius: 18, severity: "hard", feature: "none" },
    { kind: "straight", length: 600, feature: "none" },
  ];

  /** Put the car down on the centerline at `index`, pointed down the road —
   * a car that got there across country, which is exactly what driving
   * round the outside of a split board amounts to. */
  function placeAt(state: ReturnType<typeof createGame>, index: number): void {
    const s = state.track.samples[index];
    state.car.x = s.x;
    state.car.z = s.z;
    state.car.y = s.elevation;
    state.car.heading = s.heading;
    state.nearIndex = index;
  }

  it("refuses the line to a car with a board still owed, and says which", () => {
    const track = compileTrack(7, RIG);
    expect(track.checkpoints).toHaveLength(1);
    const state = createGame({ seed: 7, track, skipCountdown: true });
    // Up the opening straight under power, then set down beyond the board
    // without ever having gone through it.
    expect(drive(state, botInput, (s) => s.progressS > 200)).toBeGreaterThan(0);
    placeAt(state, track.checkpoints[0].index + 60);
    expect(state.checkpointsPassed).toBe(0);

    const missed: { next: number; count: number }[] = [];
    let finishes = 0;
    const steps = Math.round(200 / TUNING.dt);
    for (let i = 0; i < steps && missed.length === 0; i++) {
      for (const ev of step(state, botInput(state))) {
        if (ev.type === "missed") missed.push({ next: ev.next, count: ev.count });
        if (ev.type === "finish") finishes += 1;
      }
    }
    // Over the line, and nothing booked by it: no finish, no roll-out, the
    // run still live and still owing board one of one.
    expect(missed).toEqual([{ next: 0, count: 1 }]);
    expect(finishes).toBe(0);
    expect(state.phase).toBe("racing");
    expect(state.checkpointsPassed).toBe(0);
  });

  it("books the line once the owed board has been driven through", () => {
    const track = compileTrack(7, RIG);
    const state = createGame({ seed: 7, track, skipCountdown: true });
    expect(drive(state, botInput, (s) => s.progressS > 200)).toBeGreaterThan(0);
    placeAt(state, track.checkpoints[0].index + 60);
    // Over the line once, refused...
    expect(drive(state, botInput, (s) => s.progressS > track.length - 40, 200)).toBeGreaterThan(0);
    expect(state.phase).toBe("racing");
    // ...so take the way home, which puts a car owing every board back on
    // the start line, and drive the stage properly this time.
    step(state, { ...NEUTRAL_INPUT, reset: true });
    expect(state.progressS).toBe(track.samples[0].s);
    let finished = false;
    const steps = Math.round(300 / TUNING.dt);
    for (let i = 0; i < steps && !finished; i++) {
      for (const ev of step(state, botInput(state))) {
        if (ev.type === "finish") finished = true;
      }
    }
    expect(state.checkpointsPassed).toBe(1);
    expect(finished).toBe(true);
  });

  it("counts a board the car went WIDE of, and not one it went round", () => {
    const track = compileTrack(7, RIG);
    const board = track.checkpoints[0];
    const s = track.samples[board.index];
    // Straight across the board's line, offset along the road's own right.
    const rightX = Math.cos(s.heading);
    const rightZ = -Math.sin(s.heading);
    const fwdX = Math.sin(s.heading);
    const fwdZ = Math.cos(s.heading);
    const half = boardHalfWidth(track);
    const across = (offset: number): boolean =>
      crossedGate(
        track,
        board.index,
        half,
        s.x + rightX * offset - fwdX,
        s.z + rightZ * offset - fwdZ,
        s.x + rightX * offset + fwdX,
        s.z + rightZ * offset + fwdZ,
      );
    // The verge is not a miss; a car out in the country is.
    expect(across(0)).toBe(true);
    expect(across(half - 0.5)).toBe(true);
    expect(across(-(half - 0.5))).toBe(true);
    expect(across(half + 0.5)).toBe(false);
    expect(across(-(half + 0.5))).toBe(false);
    // The board is a one-way gate: reversing back through it books nothing.
    expect(
      crossedGate(track, board.index, half, s.x + fwdX, s.z + fwdZ, s.x - fwdX, s.z - fwdZ),
    ).toBe(false);
  });
});
