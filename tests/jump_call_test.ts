// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CALLING a jump, as opposed to taking one (`jump_test.ts` owns the
// physics). The co-driver has three words for a lip and they have to earn
// their difference: a word that is right about the ramp but wrong about the
// flight is worse than no word, because the driver lifts for the wrong ones
// and keeps their foot in for the rest.
import { describe, expect, it } from "vitest";

import { SAMPLE_STEP, compileTrack, jumpFlight, jumpSize, type SegmentPlan } from "@engine";

import { stageTrack } from "./support/stages.ts";

/** A one-lip stage whose ramp is exactly as steep as asked. The lip sits at
 * 400 m with room in front of it to run up and 700 m of flat road past it,
 * so nothing but the ramp decides the flight. */
function lipStage(lipHeight: number, ramp = 16): SegmentPlan[] {
  return [
    {
      kind: "straight",
      length: 1200,
      feature: "jump",
      featureStart: 400,
      featureEnd: 400 + ramp,
      lipHeight,
    },
  ];
}

/** The index of the one lip on a stage built by `lipStage`. */
function lipAt(samples: { jump: boolean }[]): number {
  const i = samples.findIndex((s) => s.jump);
  expect(i).toBeGreaterThan(0);
  return i;
}

describe("how big a jump is", () => {
  it("a steeper ramp is a longer flight", () => {
    const flights = [0.9, 1.5, 2.2].map((height) => {
      const track = compileTrack(0, lipStage(height));
      return jumpFlight(track, lipAt(track.samples), 37);
    });
    expect(flights[1]).toBeGreaterThan(flights[0]);
    expect(flights[2]).toBeGreaterThan(flights[1]);
  });

  it("...and so is the same ramp taken faster — with the square of the speed", () => {
    const track = compileTrack(0, lipStage(1.6));
    const lip = lipAt(track.samples);
    const slow = jumpFlight(track, lip, 20);
    const fast = jumpFlight(track, lip, 40);
    expect(fast).toBeGreaterThan(slow);
    // Twice the speed is four times the flight in vacuum ballistics. The
    // lip's own height is a fixed head start on top of that, so the ratio
    // comes in UNDER four and never near two.
    expect(fast / slow).toBeGreaterThan(2.6);
    expect(fast / slow).toBeLessThan(4);
  });

  it("the height the car falls back through is part of the flight, not just the angle", () => {
    // Two lips drawn at the SAME ratio — 0.1 of height per metre of ramp,
    // so the road leaves at very nearly the same angle — over ramps of
    // different lengths. The taller one throws the car from higher above
    // the grade it has to come back down to, and every metre of that is
    // flight the launch angle alone does not account for.
    const low = compileTrack(0, lipStage(1, 10));
    const high = compileTrack(0, lipStage(2, 20));
    expect(jumpFlight(high, lipAt(high.samples), 37)).toBeGreaterThan(
      jumpFlight(low, lipAt(low.samples), 37) + 3,
    );
  });

  it("the word never disagrees with the flight it is drawn from", () => {
    const rank = { small: 0, medium: 1, big: 2 };
    const seen: { flight: number; size: string }[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const track = stageTrack(seed);
      for (let i = 0; i < track.samples.length; i++) {
        if (!track.samples[i].jump) continue;
        seen.push({ flight: jumpFlight(track, i, 37), size: jumpSize(track, i) });
      }
    }
    expect(seen.length).toBeGreaterThan(10);
    for (const a of seen) {
      for (const b of seen) {
        if (a.flight > b.flight) {
          expect(rank[a.size as keyof typeof rank]).toBeGreaterThanOrEqual(
            rank[b.size as keyof typeof rank],
          );
        }
      }
    }
  });

  it("all three words are spoken by the stages the generator builds", () => {
    const spoken = new Set<string>();
    for (const challenge of [-1, 0, 1]) {
      for (let seed = 1; seed <= 12; seed++) {
        const track = stageTrack(seed, "medium", { challenge });
        for (let i = 0; i < track.samples.length; i++) {
          if (track.samples[i].jump) spoken.add(jumpSize(track, i));
        }
      }
    }
    // A vocabulary with a word nobody ever hears is a vocabulary of two.
    expect([...spoken].sort()).toEqual(["big", "medium", "small"]);
  });

  it("a savage stage jumps further than a gentle one", () => {
    const median = (challenge: number) => {
      const flights: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const track = stageTrack(seed, "medium", { challenge });
        for (let i = 0; i < track.samples.length; i++) {
          if (track.samples[i].jump) flights.push(jumpFlight(track, i, 37));
        }
      }
      flights.sort((a, b) => a - b);
      return flights[Math.floor(flights.length / 2)];
    };
    expect(median(1)).toBeGreaterThan(median(-1));
  });

  it("the flight is measured finer than the samples it is walked over", () => {
    // A flight quantized to the 2 m sample step would put every lip on a
    // stage into a handful of buckets, and the three words would then be
    // decided by rounding rather than by the road.
    const flights = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const track = stageTrack(seed);
      for (let i = 0; i < track.samples.length; i++) {
        if (track.samples[i].jump) flights.add(jumpFlight(track, i, 37));
      }
    }
    const stepped = [...flights].filter(
      (f) => Math.abs(f / SAMPLE_STEP - Math.round(f / SAMPLE_STEP)) < 1e-6,
    );
    expect(stepped.length).toBe(0);
  });
});
