// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOAD a race is stood up behind (`pwa/src/game/race-loader.ts`), and the
// one promise it exists to keep: that when the card lifts, NOTHING is left.
//
// The promise is not about the sequencing module on its own — it is about the
// sequencing plus the engine call the long step wraps. So both halves are
// here: that `advanceLoad` walks its steps and honours a budget, and that the
// field the load drives is genuinely finished when the step that drives it
// says it is. The second one is the regression that would hurt: a `drive`
// step that stopped early would hand the race a field still being written,
// and the four-millisecond-a-frame bleed the card was built to end would
// simply come back with a card in front of it.
import {
  RALLY_FIELD,
  compileStage,
  createField,
  enterCrew,
  fieldTraced,
  openField,
  payHeadStart,
  resolveKnobs,
  sealField,
} from "@engine";
import { describe, expect, it } from "vitest";

import {
  advanceLoad,
  createLoad,
  loadBudgetMs,
  type LoadStep,
} from "../pwa/src/game/race-loader.ts";

/** A step that takes `slices` frames to finish, counting the calls it got. */
function slow(id: string, slices: number, seen: string[]): LoadStep {
  let left = slices;
  return {
    id,
    run: () => {
      seen.push(id);
      left -= 1;
      return left > 0;
    },
  };
}

describe("the load's sequencing", () => {
  it("runs every step, in order, and then reports itself done", () => {
    const seen: string[] = [];
    const job = createLoad([slow("road", 1, seen), slow("world", 1, seen), slow("drive", 3, seen)]);
    let frames = 0;
    while (
      advanceLoad(
        job,
        () => true,
        () => 0,
      )
    )
      frames += 1;
    expect(seen).toEqual(["road", "world", "drive", "drive", "drive"]);
    // Nothing stopped it, so it took one pass.
    expect(frames).toBe(0);
    expect(job.at).toBe(job.steps.length);
  });

  it("stops when the frame is spent, and picks the same step up next frame", () => {
    const seen: string[] = [];
    const job = createLoad([slow("drive", 4, seen)]);
    // A budget that is spent the moment it is asked: one slice per frame.
    let frames = 0;
    while (
      advanceLoad(
        job,
        () => false,
        () => 0,
      )
    ) {
      frames += 1;
      expect(frames).toBeLessThan(20);
    }
    expect(seen).toEqual(["drive", "drive", "drive", "drive"]);
    // Three frames said "more", the fourth finished it.
    expect(frames).toBe(3);
  });

  it("keeps going into the SAME step while the frame still has room", () => {
    // The trap: treating "more to do" as a yield. `enterCrew` says it after
    // every one of fourteen crews, so a load that yielded on it would spend
    // fourteen frames on a step a couple of frames could carry — and on a
    // slow device, where the budget is biggest, it would be slowest.
    const seen: string[] = [];
    const job = createLoad([slow("crews", 14, seen)]);
    expect(
      advanceLoad(
        job,
        () => true,
        () => 0,
      ),
    ).toBe(false);
    expect(seen.length).toBe(14);
  });

  it("charges each step what it cost, so a slow one can be found", () => {
    const clock = (() => {
      let at = 0;
      return () => (at += 10);
    })();
    const job = createLoad([
      { id: "road", run: () => false },
      { id: "drive", run: () => false },
    ]);
    while (advanceLoad(job, () => true, clock));
    // Ten a call, one call each.
    expect(job.spent).toEqual([10, 10]);
  });

  it("never lets a step run with no budget left", () => {
    const seen: string[] = [];
    const job = createLoad([slow("road", 1, seen), slow("world", 1, seen)]);
    // Spent before the first step even returns.
    advanceLoad(
      job,
      () => false,
      () => 0,
    );
    expect(seen).toEqual(["road"]);
  });
});

describe("the load's frame budget", () => {
  it("gives a fast machine most of its frame", () => {
    expect(loadBudgetMs(16.7)).toBeGreaterThanOrEqual(10);
    expect(loadBudgetMs(16.7)).toBeLessThanOrEqual(16.7);
  });

  it("gives a SLOW machine a share of its frame, not a crumb of it", () => {
    // The trap a fixed budget walks into: twelve milliseconds is most of a
    // 60 Hz frame and about one percent of a one-second frame, so the slower
    // the device the smaller the share of it the load would get — and a four
    // second load would become a five minute one on the phone that could
    // least afford it.
    expect(loadBudgetMs(500)).toBeGreaterThan(100);
    expect(loadBudgetMs(1000) / 1000).toBeGreaterThan(0.1);
  });

  it("is bounded at both ends", () => {
    expect(loadBudgetMs(0)).toBeGreaterThan(0);
    expect(loadBudgetMs(100000)).toBeLessThan(1000);
  });
});

describe("what the load leaves for the race", () => {
  it("leaves NOTHING: a driven field is a fully traced one", () => {
    // The `drive` step is `payHeadStart` under the load's budget, and it is
    // done when that returns false. The race then reads the field every
    // frame; if this were ever false the app would drop back into its own
    // catch-up and take the stutter the card exists to prevent.
    const track = compileStage(38, "short", resolveKnobs({ biome: "taiga" }), "sprint", {
      season: "summer",
    });
    const stage = {
      seed: 38,
      laps: 1,
      hour: 13,
      weather: "clear" as const,
      season: "summer" as const,
    };
    const field = createField(track, RALLY_FIELD, stage);
    expect(fieldTraced(field)).toBe(false);
    // ...driven in slices, exactly as the loading card drives it.
    let slices = 0;
    while (payHeadStart(field, () => false, 256)) expect((slices += 1)).toBeLessThan(100000);
    expect(slices).toBeGreaterThan(1);
    expect(fieldTraced(field)).toBe(true);
  });

  it("enters the same field a crew at a time as it does in one call", () => {
    // The load pays for the fourteen games one per slice (`enterCrew`) so the
    // card keeps drawing between them. Same field either way, or a stage
    // loaded behind the card is a different race from one loaded without.
    const track = compileStage(19, "short", resolveKnobs({ biome: "taiga" }), "sprint", {
      season: "summer",
    });
    const stage = {
      seed: 19,
      laps: 1,
      hour: 9,
      weather: "clear" as const,
      season: "summer" as const,
    };
    const whole = createField(track, RALLY_FIELD, stage);
    const build = openField(track, RALLY_FIELD, stage);
    let crews = 0;
    while (enterCrew(build)) crews += 1;
    const sliced = sealField(build);
    expect(crews).toBe(whole.runs.length - 1);
    expect(sliced.runs.length).toBe(whole.runs.length);
    payHeadStart(whole);
    payHeadStart(sliced);
    const sheet = (f: typeof whole) =>
      f.runs.map((run) => [run.entry.number, run.time, run.splits.join(","), run.done].join("/"));
    expect(sheet(sliced)).toEqual(sheet(whole));
  });
});
