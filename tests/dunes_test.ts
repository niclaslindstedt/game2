// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R40 — THE DUNE DIAL. How high the wind has piled the desert's sand, from
// a country stripped to its rock to an erg, and what has to stay true across
// the whole of that travel.
//
// The one that costs the most to get wrong is the LAST: a dial only a sand
// country reads must not move a country with no sand in it. The taiga's
// digest is pinned in `alpine_test.ts` for the same reason and by the same
// argument — a re-rolled taiga is a re-shot preview, a stale blurb and a
// fixture failure three directories away.
//
// The heights are measured off the GROUND rather than off the arithmetic
// that built it (the country with the sand dialled off, subtracted from the
// same country with it on, is the sand and nothing else). That is the only
// way this stays true if somebody moves the profile underneath it.

import { describe, expect, it } from "vitest";

import {
  BIOMES,
  DEFAULT_KNOBS,
  STAGE_RULES,
  compileStage,
  createGeology,
  duneHeightOf,
  landOf,
  resolveKnobs,
  type BiomeId,
} from "@engine";

/** The lattice the ground is actually drawn and ridden on, and how far out
 * to walk it: far enough to cross several ergs at any dial position. */
const STEP = 14;
const SPAN = 2400;

/** The deepest sand anywhere in a square of desert country at this dial
 * position, m — the country with the dial where it is, minus the same
 * country with the sand dialled away. */
function deepestSand(seed: number, dial: number): number {
  const on = createGeology(seed, resolveKnobs({ biome: "desert", dunes: dial }));
  const off = createGeology(seed, resolveKnobs({ biome: "desert", dunes: 0 }));
  let deepest = 0;
  for (let x = -SPAN; x <= SPAN; x += STEP) {
    for (let z = -SPAN; z <= SPAN; z += STEP) {
      deepest = Math.max(deepest, on.surfaceAt(x, z) - off.surfaceAt(x, z));
    }
  }
  return deepest;
}

/** ...and the steepest face the sand puts on that same lattice, m per m. */
function steepestSand(seed: number, dial: number): number {
  const g = createGeology(seed, resolveKnobs({ biome: "desert", dunes: dial }));
  let worst = 0;
  for (let x = -SPAN; x <= SPAN; x += STEP) {
    for (let z = -SPAN; z <= SPAN; z += STEP) {
      const here = g.surfaceAt(x, z);
      const grade = Math.hypot(g.surfaceAt(x + STEP, z) - here, g.surfaceAt(x, z + STEP) - here);
      worst = Math.max(worst, grade / STEP);
    }
  }
  return worst;
}

describe("R40 — the dune dial", () => {
  it("prints the metres it builds, and builds the metres it prints", () => {
    // The row PRINTS a maximum, so what has to be true is that the deepest
    // sand in the country reaches it — not that the average does, which
    // would be a country buried to its crests everywhere.
    for (const dial of [0.1, 0.22, 0.5, 1]) {
      const knobs = resolveKnobs({ biome: "desert", dunes: dial });
      const says = duneHeightOf(knobs);
      expect(says).toBeCloseTo(dial * STAGE_RULES.dunes.height.max, 6);
      // Searched over a few seeds rather than pinned to one: whether ONE
      // square of country holds a full-height erg is a fact about where
      // that seed put its sand.
      const deepest = Math.max(...[1, 2, 3].map((seed) => deepestSand(seed, dial)));
      expect(deepest).toBeGreaterThan(says * 0.75);
      expect(deepest).toBeLessThanOrEqual(says + 1e-6);
    }
  });

  it("takes the sand away entirely at the bottom of the travel", () => {
    const bare = landOf(resolveKnobs({ biome: "desert", dunes: 0 }));
    // Not a flat dune field — NO dune field. Everything downstream reads
    // the null (`geology.ts` skips the whole term), and a zero-amplitude
    // row would divide by a zero period instead.
    expect(bare.dunes).toBeNull();
    expect(duneHeightOf(resolveKnobs({ biome: "desert", dunes: 0 }))).toBe(0);
    expect(deepestSand(1, 0)).toBe(0);
  });

  it("hands the row itself back at the dial's rest", () => {
    // Not a copy built out of multiplications by one: a country that
    // differs from its own row in the last bit of a float is a country
    // whose seeds differ from the ones the game shipped.
    const rest = landOf(resolveKnobs({ biome: "desert" }));
    expect(rest.dunes).toBe(BIOMES.desert.land.dunes);
    expect(duneHeightOf(resolveKnobs({ biome: "desert" }))).toBe(BIOMES.desert.land.dunes?.amp);
  });

  it("never stands sand steeper than its own angle of repose", () => {
    // Sand is a solid that behaves like a liquid: it cannot hold a face
    // past about 34°, which is 0.67 m per m, and a dial that made it do so
    // would be building a wall out of something that pours. This is why
    // the period grows with the height at all (`STAGE_RULES.dunes.spread`)
    // — and it is measured on the DRAWN lattice, because that is the
    // surface the car rides and the analysis reads.
    for (const dial of [0.22, 0.6, 1]) {
      for (const seed of [1, 2]) {
        expect(steepestSand(seed, dial)).toBeLessThan(0.67);
      }
    }
  });

  it("never draws the sand at a period the lattice cannot hold", () => {
    // A wave near the ground cell's own spacing is not a landscape, it is a
    // washboard. The floor under the period is what a dial near the bottom
    // of its travel runs into instead of shrinking through it.
    for (const dial of [0.01, 0.05, 0.22, 1]) {
      const D = landOf(resolveKnobs({ biome: "desert", dunes: dial })).dunes;
      expect(D).not.toBeNull();
      expect(D?.scale).toBeGreaterThanOrEqual(STAGE_RULES.dunes.floor);
    }
  });

  it("moves nothing in a country with no sand", () => {
    // The dial is not offered over the taiga or the alpine, but a stale URL
    // or a save from another build can still carry one — and the answer has
    // to be that it does nothing at all, on the row and on the road alike.
    for (const biome of ["taiga", "alpine"] as BiomeId[]) {
      expect(landOf(resolveKnobs({ biome, dunes: 1 }))).toBe(BIOMES[biome].land);
      expect(duneHeightOf(resolveKnobs({ biome, dunes: 1 }))).toBe(0);
    }
    const digest = (n: number, dunes: number): number => {
      const track = compileStage(n, "medium", { dunes }, "sprint");
      let h = 17;
      for (const s of track.samples) {
        h = (Math.imul(h, 31) + Math.round(s.x * 100)) | 0;
        h = (Math.imul(h, 31) + Math.round(s.elevation * 100)) | 0;
      }
      return h;
    };
    expect(digest(1, 1)).toBe(digest(1, DEFAULT_KNOBS.dunes));
    expect(digest(2, 0)).toBe(digest(2, DEFAULT_KNOBS.dunes));
  });
});
