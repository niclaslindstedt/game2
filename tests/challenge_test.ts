// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R46 — THE DIFFICULTY DIAL. What it moves, what it must never move, and
// the one property the whole design rests on: at REST it changes nothing at
// all, so every stage the generator has ever built is the stage it still
// builds and every campaign time still stands.
import { beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_KNOBS,
  STAGE_RULES as R,
  challengeMul,
  challengeSkew,
  compileStage,
  generateStage,
  resolveKnobs,
  roadWidthOf,
  type SegmentPlan,
  type StageKnobs,
  type Track,
  type TurnSeverity,
} from "@engine";

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 37 + 1);
const DIALS = [0, 0.35, 0.65, 1];
const dials = (challenge: number): StageKnobs => resolveKnobs({ challenge });

/** THE STAGES EVERY TEST BELOW READS, generated ONCE.
 *
 * Searching a dozen stages is seconds, and every assertion here wants the
 * same dozen: left in the tests themselves that is the same search run five
 * times over, and on a CI runner it put the first of them through vitest's
 * 30 s case timeout while the rest sat re-deriving what it had just built.
 * A hook with a timeout of its own is where a fixture that costs real time
 * belongs. */
const PLANS = new Map<number, SegmentPlan[][]>();
const TRACKS = new Map<number, Track[]>();

beforeAll(() => {
  for (const challenge of DIALS) {
    PLANS.set(
      challenge,
      SEEDS.map((seed) => generateStage(seed, "medium", { challenge })),
    );
  }
  for (const challenge of [0, 1]) {
    TRACKS.set(
      challenge,
      SEEDS.slice(0, 6).map((seed) => compileStage(seed, "medium", { challenge })),
    );
  }
}, 300_000);

/** One stage's plans per entry. */
const stages = (challenge: number): SegmentPlan[][] => PLANS.get(challenge) ?? [];
/** ...and all of them in one list, for what does not care which stage. */
const plans = (challenge: number): SegmentPlan[] => stages(challenge).flat();

/** Every corner the RALLY drew, at one dial position. A borrowed public
 * road's bends are the road's own (R17) and belong to no vocabulary. */
const corners = (challenge: number): SegmentPlan[] =>
  plans(challenge).filter((plan) => plan.kind === "turn" && !plan.paved);

const share = (plans: SegmentPlan[], severity: TurnSeverity): number =>
  plans.filter((p) => p.severity === severity).length / plans.length;

describe("R46 — the difficulty dial", () => {
  it("changes NOTHING at rest", () => {
    // The load-bearing one. Both helpers hand back the untouched number at
    // the dial's rest position, by early return rather than by arithmetic
    // that happens to come out at 1 — the difference is a stage that is bit
    // for bit the one it was, and one that is a millimetre off it.
    const mid = DEFAULT_KNOBS.challenge;
    expect(challengeMul(mid, { easy: 0.5, hard: 2 })).toBe(1);
    for (const u of [0, 0.13, 0.5, 0.87, 0.999]) {
      expect(challengeSkew(u, mid, 0.9)).toBe(u);
      expect(challengeSkew(u, mid, -0.9)).toBe(u);
      expect(challengeSkew(u, 1, 0)).toBe(u);
    }
    for (const seed of [1, 19, 4711]) {
      expect(generateStage(seed, "medium", { challenge: mid })).toEqual(generateStage(seed));
    }
  });

  it("is a knob like the others — filled in, clamped, and remembered", () => {
    // A stored race from a build with no difficulty in it is the game as it
    // was tuned, not NaN.
    expect(resolveKnobs({}).challenge).toBe(DEFAULT_KNOBS.challenge);
    expect(resolveKnobs({ challenge: 4 }).challenge).toBe(1);
    expect(resolveKnobs({ challenge: -1 }).challenge).toBe(0);
    expect(resolveKnobs({ challenge: Number.NaN }).challenge).toBe(0);
  });

  it("reads either end of its band, and only leans between them", () => {
    const band = { easy: 1.2, hard: 0.8 };
    expect(challengeMul(0, band)).toBeCloseTo(band.easy, 10);
    expect(challengeMul(1, band)).toBeCloseTo(band.hard, 10);
    // A skew is a lean on a roll, never an escape from it: whatever it does
    // to a draw, the draw is still somewhere in 0..1, which is what keeps
    // every band it is read onto a band.
    for (const challenge of [0, 0.25, 0.75, 1]) {
      for (const u of [0, 0.01, 0.5, 0.99, 1]) {
        for (const pull of [R.challenge.radius, R.challenge.angle, R.challenge.jump]) {
          const skewed = challengeSkew(u, challenge, pull);
          expect(skewed).toBeGreaterThanOrEqual(0);
          expect(skewed).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("R21 — narrows the road, and never past the band the road is built for", () => {
    const wide = roadWidthOf(dials(0));
    const rally = roadWidthOf(dials(DEFAULT_KNOBS.challenge));
    const tight = roadWidthOf(dials(1));
    expect(wide).toBeGreaterThan(rally);
    expect(rally).toBeGreaterThan(tight);
    // ...and the dial cannot walk the road out of `roadWidth` even standing
    // on top of R21's own dial at either end — the kerbs, the verge and
    // every clearance are sized off those two numbers.
    for (const width of [0, 0.5, 1]) {
      for (const challenge of [0, 0.5, 1]) {
        const built = roadWidthOf(resolveKnobs({ width, challenge }));
        expect(built).toBeGreaterThanOrEqual(R.roadWidth.min);
        expect(built).toBeLessThanOrEqual(R.roadWidth.max);
      }
    }
  });

  it("R21 — and the road the SEARCH kept clear of is the road that gets built", () => {
    // One statement of the width (`roadWidthOf`), read by the search and by
    // the compiler alike. Two would drift, and a stage whose clearances were
    // measured off a different road than the one built is R23 quietly off.
    for (const challenge of [0, 0.5, 1]) {
      const track = compileStage(19, "medium", { challenge });
      expect(track.width).toBeCloseTo(roadWidthOf(dials(challenge)), 10);
    }
  });

  it("R3 — every corner stays inside its severity's vocabulary at every position", () => {
    // The dial leans on WHICH of the corners the rules already allow keep
    // coming up. It may never draw one they do not.
    for (const challenge of DIALS) {
      for (const plan of corners(challenge)) {
        const vocab = R.turn[plan.severity ?? "soft"];
        expect(plan.radius).toBeGreaterThanOrEqual(vocab.radius.min);
        expect(plan.radius).toBeLessThanOrEqual(vocab.radius.max);
        const angle = plan.length / (plan.radius ?? 1);
        expect(angle).toBeGreaterThanOrEqual(vocab.angle.min - 1e-9);
        expect(angle).toBeLessThanOrEqual(vocab.angle.max + 1e-9);
      }
    }
  });

  it("draws MORE corners, and tighter ones", () => {
    const easy = corners(0);
    const hard = corners(1);
    // More of the stage bends...
    expect(hard.length).toBeGreaterThan(easy.length * 1.1);
    // ...fewer of those bends are the fast ones...
    expect(share(hard, "soft")).toBeLessThan(share(easy, "soft") * 0.6);
    // ...and a corner of a given severity is drawn from the tight end of
    // its own radius band.
    const radius = (plans: SegmentPlan[], severity: TurnSeverity): number => {
      const of = plans.filter((p) => p.severity === severity);
      return of.reduce((sum, p) => sum + (p.radius ?? 0), 0) / of.length;
    };
    for (const severity of ["medium", "hard"] as const) {
      expect(radius(hard, severity)).toBeLessThan(radius(easy, severity));
    }
  });

  it("R6/R11 — still lands its jumps, and still lands inside the length band", () => {
    const band = R.stageLengths.medium.band;
    for (const challenge of [0, 1]) {
      const jumps = plans(challenge).filter((p) => p.feature === "jump").length;
      for (const stage of stages(challenge)) {
        // The band with the slack R11 is actually enforced at (see
        // `mapgen_test`): a search lands the closing straight where it can.
        const length = stage.reduce((sum, p) => sum + p.length, 0);
        expect(length).toBeGreaterThanOrEqual(band.min - R.closingStraight);
        expect(length).toBeLessThanOrEqual(band.max + R.closingStraight);
      }
      // A harder stage is more corner, so it has fewer straights to hang a
      // lip on — `challenge.jumpChance` is what pays that back, and this is
      // the assertion that says it did.
      expect(jumps).toBeGreaterThanOrEqual(SEEDS.length / 2);
    }
  });

  it("throws the car higher off the lips it does place", () => {
    // What launches a car is the ramp's GRADE, so that is what is measured
    // — the lip's own height over the run it is raised across.
    const grade = (challenge: number): number => {
      const ramps: number[] = [];
      for (const plan of plans(challenge)) {
        if (plan.feature !== "jump") continue;
        const run = (plan.featureEnd ?? 0) - (plan.featureStart ?? 0);
        if (run > 0) ramps.push((plan.lipHeight ?? 0) / run);
      }
      return ramps.reduce((sum, r) => sum + r, 0) / ramps.length;
    };
    expect(grade(1)).toBeGreaterThan(grade(0) * 1.08);
  });

  it("R34 — stands the country higher around the road", () => {
    // The half of the dial a player meets by LEAVING the road: a hillside
    // to fall down rather than a field to spin on. Measured as the road's
    // own climb per kilometre, which is what the country under it decides.
    const climb = (challenge: number): number => {
      let travel = 0;
      let km = 0;
      for (const track of TRACKS.get(challenge) ?? []) {
        for (let i = 1; i < track.samples.length; i++) {
          travel += Math.abs(track.samples[i].elevation - track.samples[i - 1].elevation);
        }
        km += track.length / 1000;
      }
      return travel / km;
    };
    expect(climb(1)).toBeGreaterThan(climb(0) * 1.1);
  });
});
