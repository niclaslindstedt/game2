// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// REPLAYS — the app's half of the run tape (pwa/src/game/replay.ts): the
// world a recording is rebuilt in, the listing a kept one is shown as, and
// the roll that caps how many are kept.
//
// The engine's own property — a tape put back on the road drives the same
// metre of road — is held next door in tape_test.ts. What is asserted HERE
// is the thing that would silently break it from the app's side: a header
// field the rebuild forgets to carry. A replay built in the wrong weather,
// the wrong box or at the wrong damage scale still plays; it is simply a
// different run, somewhere else by the first corner, and no assertion about
// the engine would ever notice.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_KNOBS,
  TAPE_FORMAT,
  TUNING,
  type RunStats,
  type RunTape,
  type TapeHeader,
} from "@engine";

import {
  REPLAY_LIMIT,
  readReplayMeta,
  replayField,
  replayLine,
  replayMode,
  replayStage,
  replayTitle,
  withReplay,
  withStoredReplays,
  type ReplayMeta,
} from "../pwa/src/game/replay.ts";
import { sameStage } from "../pwa/src/game/stage-spec.ts";

const KNOBS = { ...DEFAULT_KNOBS, biome: "taiga" as const };

function header(over: Partial<TapeHeader> = {}): TapeHeader {
  return {
    kind: "run",
    format: TAPE_FORMAT,
    dt: TUNING.dt,
    engine: "0.0.0",
    recorded: "2026-01-02T03:04:05.000Z",
    source: "player",
    mode: "campaign",
    levelId: "taiga-1",
    stage: {
      seed: 38,
      length: "short",
      shape: "sprint",
      laps: 1,
      knobs: KNOBS,
      hour: 17,
      weather: "rain",
      season: "autumn",
      temperature: -4,
      sandstorms: 0.75,
    },
    car: { id: "compact", gearbox: "manual" },
    field: { difficulty: "hard", cars: 8, massStart: true, contact: true },
    start: {
      skipCountdown: true,
      grid: { number: 8, lateral: 1.5, back: 24, deficit: 24, gain: 0.3 },
    },
    damageScale: 0.5,
    ...over,
  };
}

function tapeOf(over: Partial<RunTape> = {}): RunTape {
  return {
    header: header(),
    inputs: [],
    skips: [],
    samples: [],
    result: null,
    rivals: [],
    steps: 600,
    ...over,
  };
}

function meta(over: Partial<ReplayMeta> = {}): ReplayMeta {
  return { ...readReplayMeta(tapeOf(), "a"), ...over };
}

describe("the world a replay is rebuilt in", () => {
  it("carries every field of the header that decides which stage is standing", () => {
    const spec = replayStage(header());
    expect(spec.seed).toBe(38);
    expect(spec.length).toBe("short");
    expect(spec.shape).toBe("sprint");
    expect(spec.laps).toBe(1);
    expect(spec.knobs).toEqual(KNOBS);
    expect(spec.hour).toBe(17);
    expect(spec.weather).toBe("rain");
    expect(spec.season).toBe("autumn");
    expect(spec.temperature).toBe(-4);
    expect(spec.sandstorms).toBe(0.75);
  });

  it("puts the recorded car, in the recorded box, on the recorded grid slot", () => {
    const spec = replayStage(header());
    expect(spec.carId).toBe("compact");
    // The box is PINNED rather than read off the player's options: a run
    // recorded in the manual box and replayed in the automatic one shifts
    // somewhere else and is a different drive.
    expect(spec.gearbox).toBe("manual");
    expect(spec.skipCountdown).toBe(true);
    expect(spec.grid?.back).toBe(24);
    // The apron is compiled for the whole grid, so the field's own size is
    // what the stage has to be built for.
    expect(spec.cars).toBe(8);
  });

  it("pins the damage scale the run was driven at", () => {
    // The one difficulty setting that reaches the physics. Left to the
    // player's current setting, a hard run replayed on easy takes no damage
    // at all and drives away from a crash that ended it.
    expect(replayStage(header()).damageScale).toBe(0.5);
  });

  it("leaves the damage scale to the build when the tape names none", () => {
    const older = header();
    delete older.damageScale;
    expect(replayStage(older).damageScale).toBeUndefined();
  });

  it("rebuilds the training ground as the arena rather than as a seed", () => {
    const arena = header({ mode: "training", levelId: "training" });
    arena.stage = { ...arena.stage, arena: true };
    expect(replayStage(arena).arena).toBe(true);
    // ...and a generated stage never claims to be one.
    expect(replayStage(header()).arena).toBeUndefined();
  });

  it("rebuilds the same world twice, and a different one from a different header", () => {
    expect(sameStage(replayStage(header()), replayStage(header()))).toBe(true);
    const elsewhere = header();
    elsewhere.stage = { ...elsewhere.stage, seed: 39 };
    expect(sameStage(replayStage(header()), replayStage(elsewhere))).toBe(false);
  });

  it("re-enters the field the run was driven against, and nobody when it was alone", () => {
    expect(replayField(header())?.cars).toBe(8);
    expect(replayField(header())?.difficulty).toBe("hard");
    expect(replayField(header({ field: null }))).toBeNull();
  });
});

describe("what a kept replay is listed as", () => {
  it("reads the run's own result off the tape", () => {
    const finished = tapeOf({
      result: {
        kind: "result",
        finished: true,
        time: 91.5,
        laps: 1,
        lapTimes: [91.5],
        splits: [30, 60],
        place: 3,
        of: 15,
        // Nothing here reads the run's statistics; the listing is what the
        // page shows, and that is the place, the clock and the car.
        stats: {} as RunStats,
      },
    });
    const listing = readReplayMeta(finished, "id-1");
    expect(listing.finished).toBe(true);
    expect(listing.time).toBeCloseTo(91.5, 6);
    expect(listing.place).toBe(3);
    expect(listing.of).toBe(15);
    expect(listing.levelId).toBe("taiga-1");
    expect(listing.seed).toBe(38);
    expect(listing.carId).toBe("compact");
    // Not kept until the store stamps it.
    expect(listing.savedAt).toBe(0);
  });

  it("reads a recording with no result as the clock where it stopped", () => {
    // A run that ended against a tree is still worth keeping — usually the
    // more interesting recording — so it is listed by its own length rather
    // than refused for having no time on it.
    const listing = readReplayMeta(tapeOf({ steps: 600 }), "id-2");
    expect(listing.finished).toBe(false);
    expect(listing.time).toBeCloseTo(600 * TUNING.dt, 6);
    expect(listing.place).toBeNull();
  });

  it("names the stage the ladder knows, and the seed for a road it does not", () => {
    expect(replayTitle(meta(), "Ridge Run")).toBe("RIDGE RUN");
    expect(replayTitle(meta({ seed: 7 }), null)).toBe("SEED 7");
  });

  it("writes the line under it out of the discipline, the car and the result", () => {
    const line = replayLine(meta({ finished: true, time: 91.5, place: 3, of: 15 }));
    expect(line).toContain("CAMPAIGN");
    expect(line).toContain("3RD OF 15");
    // A retirement says so instead of printing a stage time nobody set.
    expect(replayLine(meta({ finished: false }))).toContain("RETIRED");
  });

  it("names a car the catalog has dropped rather than throwing over it", () => {
    // A replay kept in an older build must not be able to take the whole
    // page down with it.
    expect(replayLine(meta({ carId: "no-such-car" }))).toContain("NO-SUCH-CAR");
  });

  it("writes each discipline in the menu's own words", () => {
    expect(replayMode(meta({ mode: "timetrial" }))).toBe("TIME TRIAL");
    expect(replayMode(meta({ mode: "headsup" }))).toBe("HEADS UP");
    // ...and an id from a build this one has never heard of still reads.
    expect(replayMode(meta({ mode: "rallycross" }))).toBe("RALLYCROSS");
  });
});

describe("the roll", () => {
  it("puts the newest first and caps the rest off the end", () => {
    let roll: ReplayMeta[] = [];
    for (let i = 0; i < REPLAY_LIMIT + 4; i++) {
      roll = withReplay(roll, meta({ id: `r${i}` }), REPLAY_LIMIT);
    }
    expect(roll).toHaveLength(REPLAY_LIMIT);
    expect(roll[0].id).toBe(`r${REPLAY_LIMIT + 3}`);
  });

  it("lets the same recording be saved twice without doubling its row", () => {
    // The disk in the replay bar is pressable for as long as the recording
    // is on screen, and a second press must not fill the roll with copies.
    const once = withReplay([], meta({ id: "same" }), REPLAY_LIMIT);
    const twice = withReplay(once, meta({ id: "same", savedAt: 99 }), REPLAY_LIMIT);
    expect(twice).toHaveLength(1);
    expect(twice[0].savedAt).toBe(99);
  });

  it("joins a read off disk under whatever was saved while it was in flight", () => {
    const held = [meta({ id: "new", savedAt: 500 })];
    const joined = withStoredReplays(held, [
      meta({ id: "old", savedAt: 100 }),
      meta({ id: "mid", savedAt: 300 }),
      // The copy already in hand wins over the stored one.
      meta({ id: "new", savedAt: 1 }),
    ]);
    expect(joined.map((entry) => entry.id)).toEqual(["new", "mid", "old"]);
    expect(joined[0].savedAt).toBe(500);
  });
});
