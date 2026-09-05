// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ARE THE RULES SOUND? Not "does a stage come out right" — the other
// suites ask that, seed by seed, and they answer slowly and move around
// whenever the geometry does. This one asks whether the numbers in
// `rules.ts` can be satisfied AT ALL, and it answers in milliseconds
// against no stage in particular.
//
// It exists because they could not. `jump.minStraight` was 90 m while a
// jump's own parts add up to 107, so a straight could pass the gate and
// then have nowhere to put the lip except inside its own run-up — silently,
// and only on the draws where the ramp came out long. And the lip's height
// and the ramp's length were drawn from independent bands whose quotient
// ran down to 0.041, under the 0.075 grade the road is allowed to climb
// anyway: a quarter of all jumps were ramps gentler than a hill, and on a
// descending road they launched nothing at all.
//
// Both were invisible to every other test. A stage still generated, still
// scored, still had a jump on it — the jump just did not work. That is what
// an incompatible pair of numbers looks like from the outside, and it is
// why these are asserted directly rather than inferred from behaviour.
//
// The rule for adding to this file: state the ARITHMETIC that has to hold
// between numbers, never a value one of them happens to have. A test that
// pins `runUp` to 35 is a test that has to be edited every time somebody
// tunes it; a test that pins `minStraight >= runUp + ramp + landing` is one
// that lets them tune freely and catches the day the sum stops working.
import { describe, expect, it } from "vitest";

import { GROUND_CELL, ROAD_CROSS, STAGE_RULES as R, TUNING, roadClearance } from "@engine";

describe("the rule book is self-consistent", () => {
  describe("R6 — jumps", () => {
    it("asks for a straight long enough to hold every part of a jump", () => {
      // The gate a straight passes to carry a lip has to cover the run-up,
      // the LONGEST ramp that can then be drawn, and the landing. Anything
      // less and `rng.range(runUp, length - landing - ramp)` is handed a
      // high bound under its low one.
      expect(R.jump.minStraight).toBeGreaterThanOrEqual(
        R.jump.runUp + R.jump.rampLength.max + R.jump.landing,
      );
    });

    it("draws a ramp steeper than any hill the road could have been on", () => {
      // A jump is a launch. The road may climb at `elevation.follow.grade`
      // under its own steam, so a ramp at or under that grade is not a
      // feature — it is a gradient, and on a descending road it does not
      // even read as that.
      expect(R.jump.ratio.min).toBeGreaterThan(R.elevation.follow.grade);
    });

    it("cannot cap a lip back under that grade", () => {
      // The lip is the ratio times the ramp, capped so the biggest ones
      // stay sane. The cap must not be able to undo the floor: at the
      // longest ramp, the capped lip still has to make the minimum grade.
      expect(R.jump.lipHeight.max / R.jump.rampLength.max).toBeGreaterThanOrEqual(R.jump.ratio.min);
      // ...and the floor must not fight it from the other end either.
      expect(R.jump.lipHeight.min).toBeLessThanOrEqual(R.jump.ratio.min * R.jump.rampLength.min);
    });

    it("leaves room between two lips for the run-up of the second", () => {
      expect(R.jump.minSpacing).toBeGreaterThan(R.jump.runUp + R.jump.landing);
    });
  });

  describe("R7/R12/R13 — crossings", () => {
    it("asks for a straight long enough to hold a ford and both aprons", () => {
      expect(R.water.minStraight).toBeGreaterThanOrEqual(R.water.length.max + 2 * R.water.apron);
    });

    it("asks for a straight long enough to hold a deck and both margins", () => {
      expect(R.bridge.minStraight).toBeGreaterThanOrEqual(R.bridge.span.max + 2 * R.bridge.margin);
    });

    it("never draws a ford wider than a car can wade", () => {
      // `fordMax` is the line between wading and decking, and a ford's own
      // width band is drawn on the wading side of it. (The deck's span is
      // NOT the other half of that band — a bridge's span is drawn from
      // `bridge.span` in its own right, so the two do not have to meet and
      // a gap between them means nothing.)
      expect(R.water.length.max).toBeLessThanOrEqual(R.water.fordMax);
    });
  });

  describe("R31/R34 — the verge and the cut", () => {
    it("benches wide enough that a lattice cell beside a road is inside it", () => {
      // The whole R31 guarantee rests on this: every corner of a lattice
      // cell a road crosses lies within the bench of that road.
      expect(R.verge.bench).toBeGreaterThanOrEqual(GROUND_CELL * Math.SQRT2);
    });

    it("holds the verge to a grade the car can climb, read back off the lattice", () => {
      // The lattice reads a field of this grade BACK at up to climb·√2
      // across a cell diagonal, and that steeper number is what the car
      // meets.
      expect(R.verge.climb * Math.SQRT2).toBeLessThan(TUNING.collision.climbLimit);
    });

    it("cuts rock steeper than it batters till, and short of vertical", () => {
      expect(R.verge.cut.face.min).toBeGreaterThan(R.verge.climb);
      expect(R.verge.cut.face.max).toBeGreaterThan(R.verge.cut.face.min);
      // A face that turns over inside one lattice cell is a fold, not a
      // cliff: it has to be drawable on the grid it is built from.
      expect(R.verge.cut.face.max).toBeLessThan(GROUND_CELL);
    });

    it("builds nothing steeper than the car can climb short of a declared rock face", () => {
      // R31 — `climbable` is the most any slope a road shapes may steepen
      // to before it is rock and has to say so. Over the runoff's own
      // grade, under the rock's, and under the car's limit with the same
      // lattice margin the runoff keeps.
      expect(R.verge.climbable).toBeGreaterThan(R.verge.climb);
      expect(R.verge.climbable).toBeLessThan(R.verge.cut.face.min);
      expect(R.verge.climbable * Math.SQRT2).toBeLessThan(TUNING.collision.climbLimit);
      // ...and the fade is a real stretch of the cone's reach, not a step.
      expect(R.verge.fade).toBeGreaterThan(GROUND_CELL * 2);
    });

    it("stands a corner guard's mound no steeper than the car can climb (R14)", () => {
      // A raised cosine's steepest point is rise · π / 2; a mound is a hill
      // that costs the corner-cutter time, never a wall that stops the car.
      expect((R.guard.rise * Math.PI) / 2).toBeLessThanOrEqual(R.verge.climbable);
    });
  });

  describe("R23/R34/R35 — where a road may go", () => {
    it("keeps two roads further apart than one road is wide", () => {
      const width = R.roadWidth.max;
      expect(roadClearance(width)).toBeGreaterThan(width + 2 * ROAD_CROSS.reach);
    });

    it("sets the water's setback inside the room two roads keep", () => {
      // The route's setback from water is a distance across the ground; it
      // has to be small enough that a road can still run a shore at all,
      // which means well inside the clearance two roads keep from each
      // other.
      expect(R.water.routeClear).toBeGreaterThan(0);
      expect(R.water.routeClear).toBeLessThan(roadClearance(R.roadWidth.min));
    });

    it("relaxes its setbacks from full standard down to none", () => {
      // Both ladders are read with the same rung index, so they have to be
      // the same length, start at the full standard, and end at nothing —
      // a country that will not yield a stage still has to produce one.
      expect(R.water.routeClearLadder.length).toBe(R.elevation.fillLadder.length);
      expect(R.water.routeClearLadder[0]).toBe(1);
      expect(R.elevation.fillLadder[0]).toBe(1);
      expect(R.water.routeClearLadder[R.water.routeClearLadder.length - 1]).toBe(0);
      expect(R.elevation.fillLadder[R.elevation.fillLadder.length - 1]).toBe(0);
      // ...and each rung is looser than the one before it.
      for (let i = 1; i < R.water.routeClearLadder.length - 1; i++) {
        expect(R.water.routeClearLadder[i]).toBeLessThan(R.water.routeClearLadder[i - 1]);
        expect(R.elevation.fillLadder[i]).toBeGreaterThan(R.elevation.fillLadder[i - 1]);
      }
    });

    it("lets a wetter country run its roads closer to the water", () => {
      // The dial has to shrink the setback, or turning the water UP pushes
      // the route into the dry corridors and the stage comes out drier
      // than a dry seed's — the dial working backwards.
      expect(R.wet.routeSetback.max).toBeLessThan(R.wet.routeSetback.min);
    });

    it("allows a road to stand further off the country than a verge is deep", () => {
      // The fill cap is a plausibility bound, not a flattener: it has to
      // leave room for ordinary cut and fill, which is at least the depth
      // the corridor itself works to.
      expect(R.elevation.maxFill).toBeGreaterThan(R.verge.bench * R.verge.climb);
      expect(R.elevation.maxCut).toBeGreaterThan(R.verge.bench * R.verge.climb);
    });
  });

  describe("R1/R2/R11 — the shape of a stage", () => {
    it("fits its openings and closings inside the shortest band it offers", () => {
      const shortest = Object.values(R.stageLengths).reduce(
        (a, spec) => Math.min(a, spec.band.min),
        Infinity,
      );
      const ends = Math.max(R.openingStraight, R.launch.run) + R.closingStraight + R.runOut;
      expect(ends).toBeLessThan(shortest);
    });
  });
});
