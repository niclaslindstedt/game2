// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R30 — SPECTATOR MODE: the run-out watched instead of read.
//
// One claim in this feature is load-bearing, and it is silent when it breaks:
// WATCHING MUST NOT CHANGE THE RESULT. The crews still out there are driven
// home either way — at eight hundred steps a frame behind the results card
// (`settleField`), or at a hundred and twenty a second under a camera
// (`watchField`) — and the classification the two produce has to be the same
// sheet, crew for crew and time for time. If it is not, the points a stage
// pays depend on whether the player pressed SPECTATE, which is not a result.
//
// The rest is the feed's own arithmetic: who the camera opens on, how the two
// buttons walk the field, and what happens to a feed whose car comes home.

import { describe, expect, it } from "vitest";

import { compileStage, fieldResults, watchField, type RivalRun } from "@engine";
import {
  RALLY_FIELD,
  createField,
  drainField,
  onRoad,
  settleField,
  settleLimit,
} from "../pwa/src/game/standings.ts";
import { readWatch, walkWatch, watchLeader } from "../pwa/src/game/spectate.ts";

const stage = {
  seed: 38,
  laps: 1,
  timeOfDay: "day",
  weather: "clear",
  season: "summer",
} as const;

/** A field on a short stage, with the whole stagger already paid off — which
 * is the state the player's own finish leaves it in (`drainField` runs at the
 * line), and therefore the only state either run-out is ever entered from. */
function enterField(): ReturnType<typeof createField> {
  const field = createField(
    compileStage(38, "short"),
    { ...RALLY_FIELD, difficulty: "medium" },
    stage,
  );
  drainField(field);
  return field;
}

/** Everybody's stage time, in start order — null for a crew who never
 * reached the line. */
const times = (field: ReturnType<typeof createField>): (number | null)[] =>
  field.runs.map((run) => run.time);

describe("the run-out is the same run-out whether or not it is watched", () => {
  it("gives every crew the same time at race speed as at settling speed", () => {
    // The player's own time, and the retirement limit it decides. Both
    // run-outs are handed exactly the same one, because the rule that
    // retires a crew is stated once (`settleLimit`).
    const limit = settleLimit(180);
    const settled = enterField();
    const spectated = enterField();
    // The field is deterministic in the seed, so two entries of it start
    // identically — anything that diverges below is the run-out itself.
    expect(times(spectated)).toEqual(times(settled));

    let guard = 0;
    while (!settleField(settled, 4000, limit) && guard < 400) guard += 1;
    expect(guard).toBeLessThan(400);

    // …and the same road driven a FRAME at a time: two physics ticks a call
    // is a machine rendering the feed at 60 fps.
    guard = 0;
    while (!watchField(spectated, 2, limit) && guard < 200_000) guard += 1;
    expect(guard).toBeLessThan(200_000);

    expect(times(spectated)).toEqual(times(settled));
    // …and therefore the sheet itself: same order, same places, same times.
    const player = { time: 180, carId: "coupe" };
    expect(fieldResults(spectated, player)).toEqual(fieldResults(settled, player));
  });

  it("retires a crew who is never coming home, by the settle's own rule", () => {
    // A limit already behind every clock on the road: nobody may be driven
    // any further, and one call clears the stage.
    const field = enterField();
    expect(watchField(field, 10_000, 0)).toBe(true);
    expect(field.runs.every((run) => run.done)).toBe(true);
  });
});

describe("the feed", () => {
  it("opens on the leader of what is left of the race", () => {
    const field = enterField();
    const leader = watchLeader(field);
    expect(leader).not.toBeNull();
    const running = field.runs.filter(onRoad);
    expect(running).toContain(leader);
    // Nobody still out there has covered more road than the car the camera
    // opens on — that is what "the leader" means here.
    const covered = (run: RivalRun): number => run.state.progressS;
    for (const run of running) {
      expect(covered(run)).toBeLessThanOrEqual(covered(leader as RivalRun));
    }
  });

  it("walks the field in both directions and wraps at both ends", () => {
    const field = enterField();
    const running = field.runs.filter(onRoad);
    // A stage this short leaves several crews on the road once the stagger
    // is paid — the walk means nothing with one.
    expect(running.length).toBeGreaterThan(2);
    const first = watchLeader(field);
    const second = walkWatch(field, first, 1);
    expect(second).not.toBe(first);
    // …and straight back again.
    expect(walkWatch(field, second, -1)).toBe(first);
    // Off the front of the list is the back of it, and never nothing.
    expect(walkWatch(field, first, -1)).not.toBeNull();
    expect(walkWatch(field, first, -1)).not.toBe(first);
  });

  it("falls to the leader for a crew who has left the road", () => {
    // What the frame loop leans on when the car under the camera crosses the
    // line: the list is rebuilt off the road every time, so a crew who is
    // home is simply not on it and the walk lands on the leader rather than
    // on nothing.
    const field = enterField();
    const home = watchLeader(field) as RivalRun;
    home.done = true;
    expect(onRoad(home)).toBe(false);
    const next = walkWatch(field, home, 1);
    expect(next).not.toBeNull();
    expect(next).not.toBe(home);
    expect(next).toBe(watchLeader(field));
  });

  it("reads nothing off a crew who is no longer out there", () => {
    const field = enterField();
    const run = watchLeader(field) as RivalRun;
    expect(readWatch(field, run, [])).not.toBeNull();
    run.done = true;
    expect(readWatch(field, run, [])).toBeNull();
  });

  it("places a staggered crew at a BOARD and nowhere between them", () => {
    const field = enterField();
    const run = field.runs.find((entry) => onRoad(entry) && entry.splits.length > 0);
    expect(run).toBeDefined();
    const watched = readWatch(field, run as RivalRun, []);
    // A rally start knows nothing live, and the player has no split times to
    // measure against yet: no place, no gap, and the strip says so rather
    // than printing the order of the road as though it were a result.
    expect(watched?.live).toBe(false);
    expect(watched?.place).toBeNull();
    expect(watched?.gap).toBeNull();
    // Hand it the player's own board times and the same crew is classified —
    // at the last board the two of them share.
    const boards = (run as RivalRun).splits.length;
    const slow = (run as RivalRun).splits.map((at) => at + 10);
    const placed = readWatch(field, run as RivalRun, slow);
    expect(placed?.board).toBe(boards);
    expect(placed?.gap).toBeCloseTo(-10, 6);
    expect(placed?.place).not.toBeNull();
    expect(placed?.place).toBeGreaterThanOrEqual(1);
    expect(placed?.place).toBeLessThanOrEqual(field.of);
  });
});
