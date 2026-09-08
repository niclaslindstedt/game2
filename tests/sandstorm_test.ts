// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SANDSTORM — the desert's weather, and the only one in the game that
// ARRIVES. What has to hold:
//
//   - it is DETERMINISTIC, from the seed and the clock alone, because the
//     replays, the rivals' traces and the sim digests all hang off that;
//   - it is answerable at any time in any ORDER, which is what lets an
//     endless run that has been going for an hour ask about its next front
//     without anybody having kept a list;
//   - the dial says how OFTEN, and the bottom of it says never;
//   - a front has a haboob's SHAPE — seen coming, then sudden, then a long
//     settling — because that asymmetry is the whole character of it;
//   - and it exists only in a country the wind can lift, so no taiga or
//     alpine run is touched by any of it.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SANDSTORMS,
  TUNING,
  biomeRules,
  calmSand,
  createGame,
  sandAt,
  sandPeriodOf,
  sandVisibility,
  sandWindSpeed,
  step,
  type BiomeId,
  type RaceEnv,
  type SandState,
} from "@engine";

const S = TUNING.sand;

/** Hands off the wheel: the storm is what is being measured, not driving. */
const COAST = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  shiftUp: false,
  shiftDown: false,
  reset: false,
};

function desertAir(over: Partial<RaceEnv> = {}): RaceEnv {
  return {
    hour: 14,
    weather: "clear",
    season: "summer",
    temperature: 32,
    windDir: 1.1,
    windSpeed: 2.5,
    gustPhase: 0,
    sand: true,
    sandstorms: DEFAULT_SANDSTORMS,
    sandSeed: 0x51a7d,
    ...over,
  };
}

/** Walk a run's worth of clock and hand back the reading at each second. */
function overRun(env: RaceEnv, seconds: number): SandState[] {
  const into = calmSand();
  const out: SandState[] = [];
  for (let t = 0; t <= seconds; t++) {
    sandAt(env, t, into);
    out.push({ sand: into.sand, approach: into.approach });
  }
  return out;
}

describe("the sandstorm", () => {
  it("brings the same fronts back for the same seed, in any order", () => {
    const env = desertAir();
    const forwards = overRun(env, 600);
    const into = calmSand();
    // Backwards, and then a couple of times at one instant: nothing here
    // may carry state from the last question it was asked.
    for (let t = 600; t >= 0; t--) {
      sandAt(env, t, into);
      expect(into.sand).toBe(forwards[t].sand);
      expect(into.approach).toBe(forwards[t].approach);
    }
    sandAt(env, 337, into);
    const once = into.sand;
    sandAt(env, 337, into);
    expect(into.sand).toBe(once);
    // ...and a different seed is a different run's weather.
    const other = overRun(desertAir({ sandSeed: 999 }), 600);
    expect(other.some((s, i) => s.sand !== forwards[i].sand)).toBe(true);
  });

  it("comes as often as the dial says, and never at the bottom of it", () => {
    expect(sandPeriodOf({ sand: true, sandstorms: 0 })).toBeNull();
    const often = sandPeriodOf({ sand: true, sandstorms: 1 })!;
    const mid = sandPeriodOf({ sand: true, sandstorms: 0.5 })!;
    const seldom = sandPeriodOf({ sand: true, sandstorms: 0.05 })!;
    expect(often).toBeLessThan(mid);
    expect(mid).toBeLessThan(seldom);
    expect(often).toBeCloseTo(S.period.often, 6);
    expect(seldom).toBeLessThan(S.period.calm);
    // ...and the dial at 0 leaves the air alone for as long as anybody
    // cares to wait.
    const still = overRun(desertAir({ sandstorms: 0 }), 3000);
    expect(still.every((s) => s.sand === 0 && s.approach === 0)).toBe(true);
    // A run at the top of the travel is in sand far more of the time than
    // one near the bottom. Measured over an hour, so the answer is about
    // the schedule and not about which front a five-minute window caught.
    const share = (dial: number): number => {
      const run = overRun(desertAir({ sandstorms: dial }), 3600);
      return run.filter((s) => s.sand > 0.05).length / run.length;
    };
    expect(share(1)).toBeGreaterThan(share(0.5));
    expect(share(0.5)).toBeGreaterThan(share(0.1));
    expect(share(1)).toBeGreaterThan(0.6);
  });

  it("is seen coming before it is felt, and hits harder than it leaves", () => {
    const env = desertAir({ sandstorms: 0.5 });
    const run = overRun(env, 3600);
    const first = run.findIndex((s) => s.sand > 0);
    expect(first).toBeGreaterThan(0);
    // THE APPROACH: the wall is up, and there is nothing in the air yet.
    // This is the half the player gets to do something about, and it is
    // most of a minute long.
    expect(run[first - 1].approach).toBeGreaterThan(0.5);
    expect(run[first - 1].sand).toBe(0);
    expect(run.slice(first - 30, first).every((s) => s.sand === 0)).toBe(true);
    // THE SHAPE: from the first sand to the peak is far quicker than from
    // the peak back to clear air. A haboob does not fade in.
    let peakAt = first;
    for (let t = first; t < run.length && run[t].sand > 0; t++) {
      if (run[t].sand > run[peakAt].sand) peakAt = t;
    }
    let end = peakAt;
    while (end < run.length - 1 && run[end].sand > 0.02) end++;
    expect(peakAt - first).toBeLessThan(end - peakAt);
    expect(run[peakAt].sand).toBeGreaterThan(S.strength.min * 0.99);
  });

  it("brings its own wind, and takes the air with it", () => {
    // A BLEND toward the front's own wind rather than a multiple of the
    // stage's: a storm on a still afternoon still blows a gale.
    expect(sandWindSpeed(2, 0)).toBe(2);
    expect(sandWindSpeed(2, 1)).toBeCloseTo(S.wind, 6);
    expect(sandWindSpeed(2, 0.5)).toBeCloseTo(2 + 0.5 * (S.wind - 2), 6);
    // ...and a wind already stronger than the front is not slowed by it.
    expect(sandWindSpeed(S.wind + 5, 1)).toBe(S.wind + 5);
    // The visibility collapses FASTER than the sand rises — that is what
    // makes the wall an event rather than a gradient.
    expect(sandVisibility(0)).toBe(1);
    expect(sandVisibility(1)).toBeCloseTo(S.visibility, 6);
    expect(sandVisibility(0.5)).toBeLessThan(0.5);
    for (let s = 0.05; s <= 1; s += 0.05) {
      expect(sandVisibility(s)).toBeLessThan(sandVisibility(s - 0.05));
    }
  });

  it("blows only where the wind can lift the ground", () => {
    // The flag is the country's, not the country's NAME — a fourth biome
    // made of sand would blow without anybody coming back here.
    expect(biomeRules("desert").blown).toBe(true);
    for (const biome of ["taiga", "alpine"] as BiomeId[]) {
      expect(biomeRules(biome).blown).toBe(false);
      expect(sandPeriodOf({ sand: false, sandstorms: 1 })).toBeNull();
      const state = createGame({ seed: 4, length: "short", knobs: { biome } });
      expect(state.env.sand).toBe(false);
      for (let i = 0; i < 400; i++) step(state, COAST);
      expect(state.sand.sand).toBe(0);
      expect(state.sand.approach).toBe(0);
    }
  });

  it("runs on the race clock inside a real desert run", () => {
    // The state's own copy is written every step beside the wind, so a
    // reader never has to ask the schedule itself.
    const state = createGame({
      seed: 11,
      length: "short",
      knobs: { biome: "desert" },
      env: { sandstorms: 1 },
    });
    expect(state.env.sand).toBe(true);
    let worst = 0;
    let windiest = 0;
    for (let i = 0; i < 120 * 200; i++) {
      step(state, COAST);
      worst = Math.max(worst, state.sand.sand);
      windiest = Math.max(windiest, Math.hypot(state.wind.x, state.wind.z));
    }
    expect(worst).toBeGreaterThan(0.4);
    // ...and the wind that comes with it is a real gale, not the desert's
    // own clear-day breeze.
    expect(windiest).toBeGreaterThan(15);
  });
});
