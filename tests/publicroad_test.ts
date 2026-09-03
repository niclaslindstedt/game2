// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE PUBLIC ROADS THE ROUTE NEVER MET, built.
//
// `highway_test.ts` holds the LINES: laid rim to rim before the rally, out
// of the water, going somewhere. Those are a plan. This is about the ones
// that get BUILT — the stretch of a line the country carries, at the
// country's own height, as an ordinary road off the stage — because before
// this the tarmac on eight seeds in twelve was a plan nobody laid and the
// country came out with no sealed road on it anywhere.
//
// What has to be true of one is what has to be true of any road off the
// stage, plus the one thing that makes it a PUBLIC road: it leaves the map
// at both ends. A road that stops in a field is the loudest mistake on the
// map, and refusing to build one is always cheaper than drawing it.

import { describe, expect, it } from "vitest";
import {
  ROAD_CROSS,
  SPUR,
  STAGE_RULES,
  compileStage,
  createLandField,
  roadClearance,
} from "@engine";

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

const stages = SEEDS.map((seed) => ({ seed, track: compileStage(seed, "medium") }));

/** Real distance from a point to the route's centerline, m. */
function routeDistance(track: (typeof stages)[number]["track"], x: number, z: number): number {
  let best = Infinity;
  for (const sample of track.samples) {
    const d = Math.hypot(sample.x - x, sample.z - z);
    if (d < best) best = d;
  }
  return best;
}

describe("the public roads the route never met (R17)", () => {
  it("puts a sealed road on the country of every stage, as an arm or as a built line", () => {
    for (const { seed, track } of stages) {
      const arms = track.spurs.filter((s) => !s.rail).length;
      expect(arms + track.publicRoads.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it("is tarmac, standing proud of the country the way a laid road does", () => {
    for (const { track } of stages) {
      for (const road of track.publicRoads) {
        expect(road.samples.every((s) => s.surface === "asphalt")).toBe(true);
        expect(road.width).toBe(track.width);
        const mid = road.samples[Math.floor(road.samples.length / 2)];
        expect(mid.lift).toBeCloseTo(ROAD_CROSS.asphaltLift, 6);
        // The joint at each end is a ramp, not a step.
        expect(road.samples[0].lift).toBeLessThan(ROAD_CROSS.asphaltLift);
      }
    }
  });

  it("leaves the country the stage occupies at BOTH ends", () => {
    const out = (track: (typeof stages)[number]["track"], p: { x: number; z: number }): boolean => {
      const b = track.bounds;
      return (
        p.x < b.minX - SPUR.escape ||
        p.x > b.maxX + SPUR.escape ||
        p.z < b.minZ - SPUR.escape ||
        p.z > b.maxZ + SPUR.escape
      );
    };
    for (const { track } of stages) {
      for (const road of track.publicRoads) {
        expect(out(track, road.samples[0])).toBe(true);
        expect(out(track, road.samples[road.samples.length - 1])).toBe(true);
        expect(road.samples[road.samples.length - 1].s).toBeGreaterThanOrEqual(SPUR.length.min);
      }
    }
  });

  it("keeps R23's clearance from the route and out of the water", () => {
    for (const { track } of stages) {
      const land = createLandField(track.seed, track.knobs);
      const keep = roadClearance(track.width);
      for (const road of track.publicRoads) {
        for (const s of road.samples) {
          expect(routeDistance(track, s.x, s.z)).toBeGreaterThanOrEqual(keep - SPUR.step);
          expect(land.flooded(s.x, s.z, 0)).toBe(false);
        }
      }
    }
  });

  it("climbs like a road: no step steeper than a minor road is built to", () => {
    for (const { track } of stages) {
      for (const road of track.publicRoads) {
        const S = road.samples;
        for (let i = 1; i < S.length; i++) {
          const run = S[i].s - S[i - 1].s;
          expect(run).toBeGreaterThan(0);
          const grade = Math.abs(S[i].elevation - S[i - 1].elevation) / run;
          expect(grade).toBeLessThanOrEqual(SPUR.maxGrade + 1e-6);
        }
      }
    }
  });

  it("builds the same roads every time it builds a seed, and none on an endless stage", () => {
    for (const { seed, track } of stages.slice(0, 4)) {
      expect(compileStage(seed, "medium").publicRoads).toEqual(track.publicRoads);
    }
    const endless = compileStage(3, "endless");
    endless.extend?.(4000);
    expect(endless.publicRoads).toEqual([]);
  });

  it("is not a second copy of a road the rally already drives", () => {
    // A line the route borrows or crosses is already built — as the run the
    // rally drives and the two arms the tape shuts — so it is not built
    // again here, and the two never stand on the same country (R23).
    for (const { track } of stages) {
      for (const road of track.publicRoads) {
        for (const spur of track.spurs) {
          for (let i = 0; i < spur.samples.length; i += 4) {
            const a = spur.samples[i];
            for (let j = 0; j < road.samples.length; j += 4) {
              const b = road.samples[j];
              expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(
                STAGE_RULES.roadClear.margin,
              );
            }
          }
        }
      }
    }
  });
});
