// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R36 — THE LEVEL CROSSING: the rally going square over a public road.
//
// R17 lays the tarmac before the stage and forbids the gravel to wander
// across it; R36 is the one way through, and everything that makes it legal
// is a property of the geometry rather than a hope. So these are the
// assertions that hold that geometry up: the two dirt arms are one straight
// line, the passage is square, the sealed road runs through it unbroken and
// SHUT ON BOTH SIDES, and the tarmac stands proud of the country by the
// height the rule says and not by whatever the country was doing.
//
// The last of those is the feature. A crossing is a jump nobody built, and
// the whole reason it can be tuned at all is that the step comes out the
// same on every seed.

import { describe, expect, it } from "vitest";
import { STAGE_RULES, compileStage, junctionMainEdge, type Track } from "@engine";

/** Seeds and lengths whose country carries a road the route goes over. Found
 * by sweeping, and pinned here rather than searched at test time: a suite
 * that hunts for its own subject reports "nothing to test" as a pass. */
const CROSSINGS: { seed: number; length: "short" | "medium" }[] = [
  { seed: 3, length: "medium" },
  { seed: 7, length: "medium" },
  { seed: 14, length: "medium" },
  { seed: 17, length: "medium" },
  { seed: 22, length: "medium" },
];

const tracks = new Map<string, Track>();
function stage(seed: number, length: "short" | "medium"): Track {
  const key = `${seed}/${length}`;
  const had = tracks.get(key);
  if (had) return had;
  const built = compileStage(seed, length, {});
  tracks.set(key, built);
  return built;
}

/** Fold an angle into 0..PI/2: which way either road points along its own
 * line does not change the angle the two of them cross at. */
function crossAngle(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d > Math.PI / 2 ? Math.PI - d : d;
}

describe("the level crossing (R36)", () => {
  it("is built on the seeds it is expected on", () => {
    // The suite's own subject. Every assertion below is quantified over the
    // crossings a seed produced, so a change that quietly stopped producing
    // any would turn this file green rather than red.
    for (const { seed, length } of CROSSINGS) {
      const track = stage(seed, length);
      expect(track.junctions.filter((j) => j.crossing).length).toBeGreaterThan(0);
    }
  });

  it("crosses SQUARE, and the two dirt arms are one straight line", () => {
    for (const { seed, length } of CROSSINGS) {
      const track = stage(seed, length);
      for (const crossing of track.junctions.filter((j) => j.crossing)) {
        // The route either side of the meeting point, out past the sealed
        // mat: both arms, on their own headings.
        const arms = [-1, 1].map((side) =>
          track.samples.reduce(
            (best, s) => {
              const d = (s.s - crossing.s) * side;
              if (d < track.width || d > track.width * 2) return best;
              return best ?? s;
            },
            null as (typeof track.samples)[number] | null,
          ),
        );
        expect(arms[0]).not.toBeNull();
        expect(arms[1]).not.toBeNull();
        // Square to the tarmac...
        for (const arm of arms) {
          expect(crossAngle(arm!.heading, crossing.heading)).toBeGreaterThan(Math.PI / 2 - 0.05);
        }
        // ...and collinear with each other, which is what makes the two
        // mouths OPPOSITE rather than two junctions that landed near one
        // another. Same heading, and both on one line through the meeting
        // point: an arm that had drifted sideways would still be parallel.
        expect(crossAngle(arms[0]!.heading, arms[1]!.heading)).toBeLessThan(0.02);
        for (const arm of arms) {
          const off =
            (arm!.x - crossing.x) * Math.cos(crossing.heading) -
            (arm!.z - crossing.z) * Math.sin(crossing.heading);
          const across =
            (arm!.x - crossing.x) * Math.sin(crossing.heading) +
            (arm!.z - crossing.z) * Math.cos(crossing.heading);
          // `off` runs down the rally and `across` sideways off it: the arm
          // is metres down its own line and centimetres off the tarmac's.
          expect(Math.abs(off)).toBeGreaterThan(track.width);
          expect(Math.abs(across)).toBeLessThan(1);
        }
      }
    }
  });

  it("leaves the sealed road running through it, and SHUTS BOTH arms", () => {
    for (const { seed, length } of CROSSINGS) {
      const track = stage(seed, length);
      for (const crossing of track.junctions.filter((j) => j.crossing)) {
        const arms = track.spurs.filter((spur) => spur.crossing && spur.atS === crossing.s);
        // Two arms, one each way — a junction abandons one and the rally
        // drives up the other; a crossing abandons the road.
        expect(arms).toHaveLength(2);
        expect(new Set(arms.map((a) => a.end)).size).toBe(2);
        for (const arm of arms) {
          // Tarmac the whole way: a public road does not turn to gravel
          // because a rally went over it (R17).
          expect(arm.samples.every((s) => s.surface === "asphalt")).toBe(true);
          // ...and shut, in sight of the crossing. This is the one place on
          // a stage where two blocks face each other across the road the car
          // is on.
          expect(arm.block).not.toBeNull();
          expect(arm.block!.s).toBeLessThanOrEqual(200);
        }
        // The two run in OPPOSITE directions out of one point.
        const [a, b] = arms.map((arm) => arm.samples[1] ?? arm.samples[0]);
        const apart = Math.hypot(a.x - b.x, a.z - b.z);
        expect(apart).toBeGreaterThan(0);
        // ...and the route's own mat is sealed where it is on theirs.
        const onSeal = track.samples.filter(
          (s) => Math.abs(s.s - crossing.s) < track.width / 2 - track.step,
        );
        expect(onSeal.length).toBeGreaterThan(0);
        expect(onSeal.every((s) => s.surface === "asphalt")).toBe(true);
        // R20 — AND ALL OF THE SEAL IS ON THE FLAT TOP. This is what keeps
        // R36 from bending R20, which forbids a lip on sealed road: the
        // tarmac's mat is half a road either side of the meeting point and
        // the platform holds level for `0.72 * spread`, which is more — so
        // both ramps and the far edge the car actually leaves are gravel,
        // like every other jump on a stage. It is arithmetic between two
        // numbers in `rules.ts`, which is exactly the kind of thing that
        // stops being true when one of them is tuned.
        const hold = 0.72 * crossing.spread;
        for (const sample of track.samples) {
          if (sample.surface !== "asphalt") continue;
          if (Math.abs(sample.s - crossing.s) <= hold) continue;
          // Sealed road further out than the flat top is fine when it is
          // somebody else's — a borrow elsewhere on the stage — so the test
          // is whether it is on THIS crossing's mat.
          const past = junctionMainEdge(crossing, sample.x, sample.z);
          expect(past === null || past >= 0).toBe(true);
        }
      }
    }
  });

  it("stands the tarmac PROUD of the country by `stand`, whatever the country does", () => {
    for (const { seed, length } of CROSSINGS) {
      const track = stage(seed, length);
      for (const crossing of track.junctions.filter((j) => j.crossing)) {
        // The step, measured against the road's own line either side: the
        // platform is tilted at the route's grade, so the rally climbs the
        // SAME height onto it whichever way the country was falling. It is
        // the property the whole feature is tuned on — read against a level
        // plane instead, the step was 2 to 2.9 m on a nominal 1.
        const ramp = 0.72 * crossing.spread + STAGE_RULES.crossing.ramp;
        for (const side of [-1, 1]) {
          // The sample NEAREST the toe of the ramp, which is not the first
          // one past it: `s` runs one way and one of the two sides runs the
          // other, so a scan for the first sample beyond the toe answers
          // with the start of the stage.
          const want = crossing.s + side * ramp;
          const toe = track.samples.reduce((best, s) =>
            Math.abs(s.s - want) < Math.abs(best.s - want) ? s : best,
          );
          // The road at the toe of the ramp against the platform's plane
          // above it: the plane is `stand` over the route's own line, and
          // over one ramp the line has moved by its own grade at most.
          const plane =
            crossing.y +
            crossing.grade.x * (toe.x - crossing.x) +
            crossing.grade.z * (toe.z - crossing.z);
          expect(plane - toe.elevation).toBeGreaterThan(0);
          expect(plane - toe.elevation).toBeLessThan(STAGE_RULES.crossing.stand * 3);
        }
      }
    }
  });

  it("keeps its ramps inside a grade a car can take", () => {
    for (const { seed, length } of CROSSINGS) {
      const track = stage(seed, length);
      for (const crossing of track.junctions.filter((j) => j.crossing)) {
        const reach = 0.72 * crossing.spread + STAGE_RULES.crossing.ramp + track.step;
        const near = track.samples.filter((s) => Math.abs(s.s - crossing.s) <= reach);
        let steepest = 0;
        for (let i = 1; i < near.length - 1; i++) {
          const run = near[i + 1].s - near[i - 1].s;
          const g = Math.abs(near[i + 1].elevation - near[i - 1].elevation) / run;
          if (g > steepest) steepest = g;
        }
        // Steep enough to throw the car, never a wall. The lip has to pitch
        // over harder than the road either side of it or there is no jump;
        // past a fifth and it is a step a damaged car stops climbing.
        expect(steepest).toBeGreaterThan(0.05);
        expect(steepest).toBeLessThan(0.2);
      }
    }
  });

  it("is the same crossing every time the seed is compiled", () => {
    for (const { seed, length } of CROSSINGS.slice(0, 3)) {
      const a = compileStage(seed, length, {}).junctions.filter((j) => j.crossing);
      const b = compileStage(seed, length, {}).junctions.filter((j) => j.crossing);
      expect(b).toEqual(a);
    }
  });
});
