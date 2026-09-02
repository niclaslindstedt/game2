// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE TARMAC, laid before the rally.
//
// The whole point of laying the sealed roads first is that "a tarmac road
// goes somewhere" stops being a hope a later check reports on and becomes a
// property of the construction. These are the assertions that make that
// true: a road crosses the country, leaves it at both ends, and stays out
// of the water while anybody can see it.

import { describe, expect, it } from "vitest";
import {
  HIGHWAY,
  LAKE_Y,
  STAGE_RULES,
  createHighwayNetwork,
  createLandField,
  highwayCount,
  layHighways,
  resolveKnobs,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 42];
const WIDTH = 16.15;

function lay(seed: number, asphalt = 0.4, length: "short" | "medium" = "short") {
  const knobs = resolveKnobs({ asphalt });
  const bound = STAGE_RULES.stageLengths[length].worldBound;
  return {
    bound,
    knobs,
    land: createLandField(seed, knobs),
    roads: layHighways(seed, knobs, createLandField(seed, knobs), bound, WIDTH),
  };
}

describe("the tarmac network (R17)", () => {
  it("is the same country every time it is laid", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const a = lay(seed).roads;
      const b = lay(seed).roads;
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].points.length).toBe(a[i].points.length);
        expect(b[i].points[0]).toEqual(a[i].points[0]);
        expect(b[i].points[a[i].points.length - 1]).toEqual(a[i].points[a[i].points.length - 1]);
      }
    }
  });

  it("lays none at all under the paving dial's floor", () => {
    const bound = STAGE_RULES.stageLengths.short.worldBound;
    expect(highwayCount(resolveKnobs({ asphalt: 0 }), bound)).toBe(0);
    for (const seed of SEEDS) {
      const knobs = resolveKnobs({ asphalt: 0 });
      expect(layHighways(seed, knobs, createLandField(seed, knobs), bound, WIDTH)).toHaveLength(0);
    }
  });

  it("crosses the country and leaves it at BOTH ends", () => {
    for (const seed of SEEDS) {
      const { roads, bound } = lay(seed);
      for (const road of roads) {
        const first = road.points[0];
        const last = road.points[road.points.length - 1];
        // Out past the map at both ends — a road nobody ever sees begin or
        // end, which is the only kind that leads somewhere.
        expect(Math.hypot(first.x, first.z)).toBeGreaterThan(bound);
        expect(Math.hypot(last.x, last.z)).toBeGreaterThan(bound);
        // ...and it went THROUGH the country rather than clipping a corner
        // of it: a road laid round the rim is scenery, not a road the stage
        // could ever meet.
        expect(road.points.some((p) => Math.hypot(p.x, p.z) <= bound)).toBe(true);
      }
    }
  });

  it("goes round the water rather than across it", () => {
    for (const seed of SEEDS) {
      const { roads, bound, land } = lay(seed);
      // Judged where it can be SEEN. Past the rim the fog has it, and a rim
      // that happens to sit in a sea basin is not a reason to leave a seed
      // with no tarmac on it at all.
      const seen = bound + HIGHWAY.overrun * 0.35;
      for (const road of roads) {
        for (const p of road.points) {
          if (Math.hypot(p.x, p.z) > seen) continue;
          expect(land.heightAt(p.x, p.z)).toBeGreaterThan(LAKE_Y);
        }
      }
    }
  });

  it("bends like a road rather than cornering like a stage", () => {
    for (const seed of SEEDS) {
      for (const road of lay(seed).roads) {
        for (let i = 1; i < road.points.length; i++) {
          let turn = road.points[i].heading - road.points[i - 1].heading;
          while (turn > Math.PI) turn -= 2 * Math.PI;
          while (turn <= -Math.PI) turn += 2 * Math.PI;
          // The radius it turned through over one step. Bounded by the
          // radius it is allowed while skirting water, which is the tightest
          // a public road ever bends — anything under that is a corner, and
          // a corner in the middle of open country is the tell that a line
          // was drawn rather than a road laid.
          const radius = Math.abs(turn) > 1e-9 ? HIGHWAY.step / Math.abs(turn) : Infinity;
          expect(radius).toBeGreaterThan(HIGHWAY.avoidRadius * 0.9);
        }
      }
    }
  });

  it("answers where the nearest tarmac is", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const { roads } = lay(seed);
      if (roads.length === 0) continue;
      const network = createHighwayNetwork(roads);
      // Against a brute-force walk, at points spread over the map: the
      // index is a search shortcut, and a shortcut that finds a different
      // answer is a bug the game would only show as a junction in the wrong
      // place.
      for (let k = 0; k < 24; k++) {
        const x = -900 + (k % 6) * 360;
        const z = -900 + Math.floor(k / 6) * 360;
        let best = Infinity;
        for (const road of roads) {
          for (const p of road.points) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
        }
        expect(network.nearest(x, z)?.d).toBeCloseTo(best, 6);
      }
    }
  });

  it("gives a BOUNDED look the same answer as an unbounded one", () => {
    // The bounded query is the one the search actually asks — of every probe
    // point at R23's clearance, and of every segment at the borrow's and the
    // crossing's reach — and it is the one with the shortcuts in it: a cell
    // set per reach that answers "no tarmac here" without walking. A set
    // dilated too tightly answers "nothing" where there IS something, and
    // the stage that comes out is a rally road laid along a public one with
    // nothing reporting it. So the bound must change only the ANSWER'S
    // RANGE, never the answer.
    const radii = [40, 128, 129, 420, 600, 640, 641, 2000];
    for (const seed of SEEDS.slice(0, 5)) {
      const { roads } = lay(seed);
      if (roads.length === 0) continue;
      const network = createHighwayNetwork(roads);
      for (let k = 0; k < 63; k++) {
        const x = -1200 + (k % 9) * 300;
        const z = -1200 + Math.floor(k / 9) * 300;
        const full = network.nearest(x, z);
        for (const within of radii) {
          const hit = network.nearest(x, z, undefined, within);
          if (full && full.d <= within) {
            expect(
              hit,
              `seed ${seed} lost the road at ${within} m from (${x}, ${z})`,
            ).not.toBeNull();
            expect(hit?.d).toBeCloseTo(full.d, 6);
            expect(hit?.index).toBe(full.index);
          } else {
            expect(hit, `seed ${seed} found a road past ${within} m from (${x}, ${z})`).toBeNull();
          }
        }
      }
    }
  });
});
