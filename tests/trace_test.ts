// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FIELD OF GHOSTS — the campaign's rivals written down before the green
// (engine/sim/trace.ts) and played back by the clock (engine/sim/field.ts).
//
// Four claims carry it, and every one is silent when it breaks:
//
//   * A GHOST'S RUN IS THE CREW'S OWN SOLO RUN. The trace is the real bot on
//     the real engine, so its time has to be the time `simulateStage` gives
//     the same crew on the same road — to the step — or the sheet the
//     campaign classifies against is a different stage from the one the
//     `--field` table tunes.
//   * A GHOST IS WHERE ITS RUN WAS. Played back off thirty samples a second,
//     the shown car has to sit on the sim's own path, between samples as
//     well as on them, or the car you are closing on is not the car that
//     posted the time.
//   * A GHOST CANNOT BE TOUCHED, and never sees you.
//   * THE FIELD IS WRITTEN BEFORE THE GREEN, in the order the road needs
//     it, and the app can ask whether it is done.

import { describe, expect, it } from "vitest";

import {
  GRID_STAGGER,
  RALLY_FIELD,
  RIVALS,
  TRACE_EVERY,
  TUNING,
  advanceField,
  botInput,
  compileStage,
  createField,
  createGame,
  fieldResults,
  fieldTraced,
  onRoad,
  payHeadStart,
  rivalField,
  rubRivals,
  settleField,
  settleLimit,
  step,
  stepField,
  type GameState,
  type RivalRun,
} from "@engine";

const SEED = 44;
const stage = {
  seed: SEED,
  laps: 1,
  timeOfDay: "day",
  weather: "clear",
  season: "summer",
} as const;

function ghosts(difficulty: "easy" | "medium" | "hard" = "medium") {
  return createField(compileStage(SEED, "short"), { ...RALLY_FIELD, difficulty }, stage);
}

/** The same crew's game, entered exactly as `createField` enters a rally
 * rival, to be stepped beside the ghost as the reference. */
function soloOf(run: RivalRun, track: GameState["track"]): GameState {
  return createGame({
    seed: SEED,
    carId: run.entry.crew.carId,
    gearbox: run.entry.gearbox,
    track,
    laps: 1,
    skipCountdown: true,
    quiet: true,
    gridOffset: GRID_STAGGER,
    env: { timeOfDay: "day", weather: "clear", season: "summer" },
  });
}

describe("the campaign's field of ghosts", () => {
  it("is entered with nobody solid, best crew first and the player last", () => {
    expect(RALLY_FIELD.contact).toBe(false);
    expect(RALLY_FIELD.massStart).toBe(false);
    const entries = rivalField("medium");
    // Reputation order: car 1 is the head of the field, and every number
    // after it is a crew of lower standing, right down to the tail.
    const best = Math.max(...RIVALS.map((crew) => crew.standing));
    expect(entries[0].number).toBe(1);
    expect(entries[0].crew.standing).toBe(best);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].number).toBe(i + 1);
      expect(entries[i].crew.standing).toBeLessThan(entries[i - 1].crew.standing);
    }
    const field = ghosts();
    expect(field.contact).toBe(false);
    expect(field.playerNumber).toBe(field.of);
    // Nobody is stepped live: every run has a trace and a shown state of
    // its own, apart from the sim that writes it.
    for (const run of field.runs) {
      expect(run.trace).not.toBeNull();
      expect(run.state).not.toBe(run.sim);
    }
  });

  it("writes every crew's run down before the green, and says when it is done", () => {
    const field = ghosts();
    expect(fieldTraced(field)).toBe(false);
    // Only the crew directly in front is out of the control before a step
    // is written: it is stood on the line, and the shot opens on it.
    expect(field.runs.filter(onRoad).map((run) => run.entry.number)).toEqual([field.of - 1]);
    // Paid in slices, like the app pays it: the answer is "more to do"
    // until it is not.
    let slices = 0;
    while (payHeadStart(field, () => false, 256)) slices += 1;
    expect(slices).toBeGreaterThan(1);
    expect(fieldTraced(field)).toBe(true);
    for (const run of field.runs) expect(run.trace!.sealed).toBe(true);
    // Everybody the clock has reached is on the road (or already home);
    // nobody is owed road that has been written.
    for (const run of field.runs) expect(run.done || run.owed <= 0).toBe(true);
  });

  it("gives each crew the time its own solo run posts, to the step", () => {
    const track = compileStage(SEED, "short");
    const field = createField(track, { ...RALLY_FIELD, difficulty: "hard" }, stage);
    payHeadStart(field);
    // The whole run-out, at settling speed: the sheet is the crews' times.
    let guard = 0;
    while (!settleField(field, 50_000, settleLimit(100)) && guard < 200) guard += 1;
    expect(guard).toBeLessThan(200);
    const rows = fieldResults(field, { time: 100, carId: "compact" });
    expect(rows.filter((row) => row.time !== null).length).toBeGreaterThan(8);
    // Three crews from the head, the middle and the tail of the field,
    // driven alone from the same slot by the same brain: the same metre of
    // road and the same clock, or the trace is not the run.
    for (const number of [1, 7, 14]) {
      const run = field.runs.find((r) => r.entry.number === number)!;
      const solo = soloOf(run, track);
      let time: number | null = null;
      for (let i = 0; i < TUNING.physicsHz * 400 && time === null; i++) {
        for (const event of step(solo, botInput(solo, run.entry.profile))) {
          if (event.type === "finish") time = event.time;
          if (event.type === "retire") break;
        }
        if (solo.phase === "retired") break;
      }
      expect(run.time, run.entry.crew.alias).toBe(time);
    }
  });

  it("poses a ghost on its own run's path, on a sample and between two", () => {
    const track = compileStage(SEED, "short");
    const field = createField(track, RALLY_FIELD, stage);
    payHeadStart(field);
    // The crew directly in front owes nothing, so its clock is the field's.
    const front = field.runs.find((run) => run.entry.number === field.of - 1)!;
    const solo = soloOf(front, track);
    const ticks = TRACE_EVERY * 300 + 2;
    for (let i = 0; i < ticks; i++) {
      stepField(field);
      step(solo, botInput(solo, front.entry.profile));
      const shown = front.state.car;
      // On a sample the pose is the sim's own, to float precision; between
      // two it is a straight line across a few centimetres of road.
      const slack = i % TRACE_EVERY === TRACE_EVERY - 1 ? 0.02 : 0.3;
      expect(Math.hypot(shown.x - solo.car.x, shown.z - solo.car.z), `step ${i}`).toBeLessThan(
        slack,
      );
      expect(Math.abs(shown.heading - solo.car.heading), `step ${i}`).toBeLessThan(0.05);
      expect(Math.abs(shown.u - solo.car.u), `step ${i}`).toBeLessThan(0.5);
    }
    expect(front.state.raceTime).toBeCloseTo(solo.raceTime, 2);
    // Progress is written on the trace's samples only, so between two the
    // ghost's trails the solo's by up to a sample's worth of road at the
    // speed the car is doing.
    const sampleRun = TRACE_EVERY * TUNING.dt * Math.abs(solo.car.u);
    expect(Math.abs(front.state.progressS - solo.progressS)).toBeLessThan(sampleRun + 0.5);
    expect(front.state.car.gear).toBe(solo.car.gear);
    // …and the clock is the field's: skipping the shot moves it on.
    advanceField(field, 4);
    for (let i = 0; i < Math.round(4 / TUNING.dt); i++) {
      step(solo, botInput(solo, front.entry.profile));
    }
    expect(front.state.raceTime).toBeCloseTo(solo.raceTime, 2);
    expect(Math.hypot(front.state.car.x - solo.car.x, front.state.car.z - solo.car.z)).toBeLessThan(
      0.3,
    );
  });

  it("cannot be touched by the player, and never moves for them", () => {
    const track = compileStage(SEED, "short");
    const field = createField(track, RALLY_FIELD, stage);
    payHeadStart(field);
    const front = field.runs.find((run) => run.entry.number === field.of - 1)!;
    // A player entered ON the ghost's own slot, driven by the same brain:
    // the two are inside each other's bodywork for the whole run.
    const player = soloOf(front, track);
    const reference = soloOf(front, track);
    let met = 0;
    for (let i = 0; i < TUNING.physicsHz * 20; i++) {
      stepField(field, player);
      step(player, botInput(player, front.entry.profile));
      step(reference, botInput(reference, front.entry.profile));
      const mine = rubRivals(field, player);
      expect(mine).toEqual([]);
      const them = front.state.car;
      if (Math.hypot(them.x - player.car.x, them.z - player.car.z) < 1) met += 1;
    }
    // They really were on top of each other, and nothing came of it: the
    // player's car carries exactly the marks the undisturbed reference
    // carries (this stage has a tree in it) and sits on the reference's own
    // path, and the ghost drove the run it would have driven with nobody
    // there — its body folded only where its own trace says it did.
    expect(met).toBeGreaterThan(TUNING.physicsHz * 10);
    expect(player.car.damage.version).toBe(reference.car.damage.version);
    expect(Math.hypot(player.car.x - reference.car.x, player.car.z - reference.car.z)).toBeLessThan(
      1e-6,
    );
    const at = field.clock + front.offset;
    const marked = front.trace!.marks.filter((mark) => mark.step <= at).at(-1);
    expect(front.state.car.damage.version).toBe(marked?.damage.version ?? 0);
  });

  it("folds a ghost's body when its run did, and not before", () => {
    // Search the difficulties for a crew who marked the car: a trace with a
    // damage mark that happens AFTER the field's clock zero, so the shown
    // car has a before and an after.
    let found: { run: RivalRun; field: ReturnType<typeof ghosts> } | null = null;
    for (const difficulty of ["hard", "medium", "easy"] as const) {
      const field = ghosts(difficulty);
      payHeadStart(field);
      const run = field.runs.find(
        (r) => r.trace!.marks.length > 0 && r.trace!.marks[0].step > r.offset + TRACE_EVERY,
      );
      if (run) {
        found = { run, field };
        break;
      }
    }
    if (!found) throw new Error("no crew marks the car after the shot opens on this stage");
    const { run, field } = found;
    const mark = run.trace!.marks[0];
    expect(run.state.car.damage.version).toBe(0);
    // Tick the clock to the step before the mark, then across it.
    const before = mark.step - run.offset - 1;
    advanceField(field, before * TUNING.dt);
    expect(run.state.car.damage.version).toBe(0);
    stepField(field);
    expect(run.state.car.damage.version).toBe(mark.damage.version);
    expect(run.state.car.damage).toBe(mark.damage);
  });
});
