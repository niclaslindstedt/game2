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
  loadPhase,
  loadTimes,
  type LoadStep,
} from "../pwa/src/game/race-loader.ts";

/** A step that takes `slices` frames to finish, counting the calls it got.
 * Every step shares one label unless a test is about the PHASES, so the
 * sequencing suites below are not also measuring the phase-boundary yield. */
function slow(id: string, slices: number, seen: string[], label = "work"): LoadStep {
  let left = slices;
  return {
    id,
    label,
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
      { id: "road", label: "work", run: () => false },
      { id: "drive", label: "work", run: () => false },
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

describe("what the card says the load is doing", () => {
  it("stops at a phase boundary so the card can name what is coming", () => {
    // Without this the tail of a load — arming a ghost, arming a tape,
    // compiling every shader the stage needs — goes through in one slice, and
    // the phase that covers it is never on screen at all: the card would sit
    // on `(4/5)` through the longest indivisible call of the lot.
    const seen: string[] = [];
    const job = createLoad([
      slow("ghost", 1, seen, "Warming up"),
      slow("tape", 1, seen, "Warming up"),
      slow("warm", 1, seen, "Warming up"),
      slow("done", 1, seen, "Ready"),
    ]);
    // A frame with all the budget in the world still stops where the words
    // change — and takes the three steps that share a label together.
    expect(
      advanceLoad(
        job,
        () => true,
        () => 0,
      ),
    ).toBe(true);
    expect(seen).toEqual(["ghost", "tape", "warm"]);
    expect(loadPhase(job)).toMatchObject({ label: "Ready", at: 2, of: 2 });
  });

  it("counts PHASES, not steps — neighbours sharing a label are one line", () => {
    // The split into steps is about what can be cut up; the card's count is
    // about what a person can read. Arming a ghost and arming a tape are two
    // calls and one thing being waited for.
    const seen: string[] = [];
    const job = createLoad([
      slow("road", 1, seen, "Plotting the route"),
      slow("ghost", 1, seen, "Warming up"),
      slow("tape", 1, seen, "Warming up"),
      slow("warm", 1, seen, "Warming up"),
    ]);
    expect(loadPhase(job)).toMatchObject({ label: "Plotting the route", at: 1, of: 2 });
  });

  it("walks the count forward as the steps are paid for", () => {
    const seen: string[] = [];
    const job = createLoad([
      slow("road", 1, seen, "one"),
      slow("world", 1, seen, "two"),
      slow("drive", 2, seen, "three"),
    ]);
    const spent = () => false; // one slice per frame
    const at: string[] = [];
    at.push(`${loadPhase(job).label} ${loadPhase(job).at}/${loadPhase(job).of}`);
    while (advanceLoad(job, spent, () => 0)) {
      at.push(`${loadPhase(job).label} ${loadPhase(job).at}/${loadPhase(job).of}`);
      expect(at.length).toBeLessThan(20);
    }
    expect(at).toEqual(["one 1/3", "two 2/3", "three 3/3", "three 3/3"]);
  });

  it("holds at the last phase once the load is done, never (n+1)/n", () => {
    // The frame the card lifts on still draws it, and `(4/3)` on the way out
    // would be the last thing the player read.
    const seen: string[] = [];
    const job = createLoad([slow("road", 1, seen, "one"), slow("warm", 1, seen, "two")]);
    while (
      advanceLoad(
        job,
        () => true,
        () => 0,
      )
    );
    expect(job.at).toBe(job.steps.length);
    expect(loadPhase(job)).toMatchObject({ label: "two", at: 2, of: 2 });
  });
});

describe("the bar under the words", () => {
  const seen: string[] = [];
  /** A step that can count itself: `parts` slices, and it says which it is on. */
  const counted = (id: string, parts: number, label: string): LoadStep => {
    let at = 0;
    return {
      id,
      label,
      progress: () => at / parts,
      run: () => (at += 1) < parts,
    };
  };

  it("offers a MEASURED fraction only where the work can count itself", () => {
    const job = createLoad([slow("road", 1, seen, "Plotting"), counted("crews", 4, "Entering")]);
    // Nothing inside compiling a road can be counted, so the card is told so
    // rather than handed a number somebody made up.
    expect(loadPhase(job).done).toBe(null);
    advanceLoad(
      job,
      () => false,
      () => 0,
    );
    expect(loadPhase(job).done).toBe(0);
    advanceLoad(
      job,
      () => false,
      () => 0,
    );
    expect(loadPhase(job).done).toBeCloseTo(0.25, 5);
  });

  it("weighs a phase's steps equally, a finished one whole", () => {
    // "Entering the field" is the crews counted out of the entry list and
    // then one call to put them on the road; the bar has to cross the seam
    // between them without going backwards.
    const job = createLoad([counted("crews", 2, "Entering"), slow("enter", 1, seen, "Entering")]);
    const step = () =>
      advanceLoad(
        job,
        () => false,
        () => 0,
      );
    step();
    expect(loadPhase(job).done).toBeCloseTo(0.25, 5); // half of the first step
    step();
    expect(loadPhase(job).done).toBeCloseTo(0.5, 5); // crews in, enter to go
    step();
    expect(loadPhase(job).done).toBe(1);
  });

  it("has nothing to estimate from until a machine has run a load", () => {
    const job = createLoad([slow("road", 1, seen, "Plotting")]);
    expect(loadPhase(job).expectedMs).toBe(null);
  });

  it("estimates a phase at what ALL of its steps cost last time", () => {
    const job = createLoad(
      [
        slow("ghost", 1, seen, "Warming up"),
        slow("tape", 1, seen, "Warming up"),
        slow("warm", 1, seen, "Warming up"),
      ],
      { ghost: 20, tape: 5, warm: 400 },
    );
    expect(loadPhase(job).expectedMs).toBe(425);
  });

  it("refuses to estimate a phase it only half remembers", () => {
    // A build that adds a step to a phase leaves last time's numbers covering
    // part of it, and a bar run against a fraction of the work would fill
    // early and then sit at its ceiling for the rest.
    const job = createLoad(
      [slow("ghost", 1, seen, "Warming up"), slow("warm", 1, seen, "Warming up")],
      { ghost: 20 },
    );
    expect(loadPhase(job).expectedMs).toBe(null);
  });

  it("only remembers a load that RAN TO THE END", () => {
    // Half a step's cost, written down, tells the next card the work takes
    // half as long as it does — and the bar it draws is wrong on every load
    // after it.
    const clock = (() => {
      let at = 0;
      return () => (at += 10);
    })();
    const job = createLoad([slow("road", 1, seen, "one"), slow("warm", 1, seen, "two")]);
    advanceLoad(job, () => false, clock);
    expect(loadTimes(job)).toEqual({});
    while (advanceLoad(job, () => true, clock));
    expect(loadTimes(job)).toEqual({ road: 10, warm: 10 });
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
