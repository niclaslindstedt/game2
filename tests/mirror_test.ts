// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MIRROR'S PACE LADDER — the one piece of the renderer that decides, on
// its own, to draw less than it was asked for.
//
// It is verified here rather than by looking, because what it does is not
// visible in a frame: the whole point of dropping the mirror's rate first is
// that the picture does not change. What CAN be looked at is the strip going
// stale, and a ladder with a bad rule in it either does that when the
// machine was fine, or never does it when the machine is drowning. So the
// claims are the ones a screenshot cannot make:
//
//   * a machine holding the target keeps the fastest rung — nobody pays for
//     a governor that governs a game that is already fine;
//   * a machine that has fallen behind gives up the rate BEFORE the reach,
//     because rate is free and reach is picture;
//   * one stalled frame is not a verdict;
//   * the climb back is a probe, and a probe that fails costs more to
//     repeat, or a machine that cannot hold sixty stutters every few
//     seconds for the whole stage.

import { describe, expect, it } from "vitest";

import { createMirrorPace, MIRROR_TIERS, refillGap } from "../pwa/src/game/mirror-pace.ts";
import type { MirrorPace } from "../pwa/src/game/mirror-pace.ts";

/** Drive `seconds` of frames at a steady rate through the pace. */
function run(pace: MirrorPace, fps: number, seconds: number): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) pace.frame(dt);
}

/** Feed a steady rate until the rung MOVES, and answer how long that took,
 * seconds. The ladder holds a rung for a dwell measured in seconds, so
 * everything here is a question about time rather than about frames — and
 * asking it this way keeps the assertions off the exact thresholds, which
 * are tuning and are allowed to move. Gives up after five minutes of stage,
 * which is longer than any wait the ladder can ask for. */
function untilRungMoves(pace: MirrorPace, fps: number): number {
  const dt = 1 / fps;
  const was = pace.tier();
  let waited = 0;
  while (pace.tier() === was && waited < 300) {
    pace.frame(dt);
    waited += dt;
  }
  return waited;
}

describe("the mirror's pace ladder", () => {
  it("leaves a machine that holds the target alone", () => {
    const pace = createMirrorPace();
    run(pace, 60, 30);
    expect(pace.tier()).toBe(MIRROR_TIERS[0]);
  });

  it("gives up the RATE first, and keeps the reach while it does", () => {
    const pace = createMirrorPace();
    untilRungMoves(pace, 40);
    const tier = pace.tier();
    expect(tier.hz).toBeLessThan(MIRROR_TIERS[0].hz);
    expect(tier.range).toBe(MIRROR_TIERS[0].range);
  });

  it("falls within a second or so of the rate going, and not on the first frame", () => {
    const pace = createMirrorPace();
    const fell = untilRungMoves(pace, 40);
    expect(fell).toBeGreaterThan(0.5);
    expect(fell).toBeLessThan(3);
  });

  it("pulls the reach in only once the rate has run out of rungs", () => {
    const pace = createMirrorPace();
    run(pace, 25, 30);
    const bottom = MIRROR_TIERS[MIRROR_TIERS.length - 1];
    expect(pace.tier()).toBe(bottom);
    // The bottom rung is the one that hands frames back to the FORWARD pass
    // (a shorter mirror frustum is less country the world cull has to keep),
    // so it has to actually be shorter.
    expect(bottom.range).toBeLessThan(MIRROR_TIERS[0].range);
  });

  it("does not fall down a rung for one stalled frame", () => {
    const pace = createMirrorPace();
    run(pace, 60, 5);
    // A tenth of a second is the longest frame the app will report — the
    // frame loop clamps there — so this is the worst single hitch there is.
    pace.frame(0.1);
    run(pace, 60, 3);
    expect(pace.tier()).toBe(MIRROR_TIERS[0]);
  });

  it("takes the rung back when the machine recovers", () => {
    const pace = createMirrorPace();
    untilRungMoves(pace, 40);
    expect(pace.tier()).not.toBe(MIRROR_TIERS[0]);
    run(pace, 60, 60);
    expect(pace.tier()).toBe(MIRROR_TIERS[0]);
  });

  it("waits longer before each climb that has to be given straight back", () => {
    const pace = createMirrorPace();
    /** A machine that cannot afford the faster pace: hold the rate up until
     * the ladder climbs, then let it go until the rung is given back — and
     * answer how long the ladder waited before asking. */
    const probe = (): number => {
      const climbed = untilRungMoves(pace, 60);
      untilRungMoves(pace, 40);
      return climbed;
    };
    untilRungMoves(pace, 40);
    expect(pace.tier()).toBe(MIRROR_TIERS[1]);
    const first = probe();
    const second = probe();
    expect(pace.tier()).toBe(MIRROR_TIERS[1]);
    expect(second).toBeGreaterThan(first * 1.5);
  });

  it("reads nothing at all off a frame nobody drew", () => {
    const pace = createMirrorPace();
    run(pace, 20, 5);
    const stalled = pace.tier();
    const rate = pace.fps();
    for (let i = 0; i < 600; i++) pace.frame(0);
    expect(pace.tier()).toBe(stalled);
    expect(pace.fps()).toBeCloseTo(rate, 6);
  });

  it("asks for a refill early enough that a rung is worth what it says", () => {
    // THE TRAP THE TOLERANCE EXISTS FOR. The top rung is exactly the rate a
    // sixty-hertz display delivers frames at, and no display delivers them
    // evenly: without a tolerance, a frame arriving a fraction early is a
    // refill skipped and the next one is 33 ms old, so a mirror asked for
    // sixty runs at thirty on the machine the rung was written for. Counted
    // here the way renderer.ts counts it — an age that resets on every fill.
    const fills = (hz: number, frameMs: number, seconds: number): number => {
      const dt = frameMs / 1000;
      let age = Infinity;
      let filled = 0;
      for (let t = 0; t < seconds; t += dt) {
        age += dt;
        if (age < refillGap(hz)) continue;
        age = 0;
        filled++;
      }
      return filled;
    };
    // A display that is a shade fast, and one that is a shade slow.
    expect(fills(60, 16.5, 1)).toBeGreaterThan(55);
    expect(fills(60, 16.9, 1)).toBeGreaterThan(55);
    // ...and the rung below still costs half of it, rather than creeping up
    // to meet it.
    expect(fills(30, 16.5, 1)).toBeLessThan(35);
  });

  it("holds the rung a harness pinned it to, and hands it back", () => {
    const pace = createMirrorPace();
    // The rate a meter asks for is the rate it gets, and no amount of the
    // software rasterizer it is running on moves it.
    pace.pin(MIRROR_TIERS[0].hz);
    run(pace, 5, 60);
    expect(pace.tier()).toBe(MIRROR_TIERS[0]);
    // ...but the rate underneath is still measured, because reading it is
    // the reason anybody pins one.
    expect(pace.fps()).toBeLessThan(10);
    pace.pin(null);
    untilRungMoves(pace, 5);
    expect(pace.tier()).not.toBe(MIRROR_TIERS[0]);
  });

  it("answers a pin nobody built a rung for with the nearest one", () => {
    const pace = createMirrorPace();
    pace.pin(1000);
    expect(pace.tier()).toBe(MIRROR_TIERS[0]);
    pace.pin(1);
    expect(pace.tier()).toBe(MIRROR_TIERS[MIRROR_TIERS.length - 1]);
  });

  it("keeps the rung across a spell with the glass down", () => {
    const pace = createMirrorPace();
    untilRungMoves(pace, 30);
    const dropped = pace.tier();
    expect(dropped).not.toBe(MIRROR_TIERS[0]);
    // The mirror stands down behind a menu and comes back up on the next
    // stage: what the machine can draw has not changed, so neither has this.
    pace.settle();
    expect(pace.tier()).toBe(dropped);
  });
});
