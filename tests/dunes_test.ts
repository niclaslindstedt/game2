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

/** ...and the steepest face the sand puts on that same lattice, m per m.
 *
 * Off the SAND, the way `deepestSand` reads the depth: the country with the
 * dial on, less the same country with it off. Read off `surfaceAt` alone it
 * is not the sand's face, it is the sand's face PLUS whatever the rock was
 * already doing under it — and the rock is doing plenty. The same walk over
 * a desert with no sand in it at all comes back at 0.49 m per m, which is
 * three quarters of the sand's whole budget spent before a grain is placed;
 * a check written that way reports the geology and calls it repose. */
function steepestSand(seed: number, dial: number): number {
  const on = createGeology(seed, resolveKnobs({ biome: "desert", dunes: dial }));
  const off = bareRock(seed);
  const sand = (x: number, z: number): number => on.surfaceAt(x, z) - off.surfaceAt(x, z);
  let worst = 0;
  for (let x = -SPAN; x <= SPAN; x += STEP) {
    for (let z = -SPAN; z <= SPAN; z += STEP) {
      const here = sand(x, z);
      const grade = Math.hypot(sand(x + STEP, z) - here, sand(x, z + STEP) - here);
      worst = Math.max(worst, grade / STEP);
    }
  }
  return worst;
}

/** The same country with the sand dialled away, kept: it does not depend on
 * the dial, and building one is the most expensive thing here. */
const BARE = new Map<number, ReturnType<typeof createGeology>>();
function bareRock(seed: number): ReturnType<typeof createGeology> {
  let g = BARE.get(seed);
  if (!g) {
    g = createGeology(seed, resolveKnobs({ biome: "desert", dunes: 0 }));
    BARE.set(seed, g);
  }
  return g;
}

/** The steepest face of a WHOLE desert surface, sand and rock together —
 * what reading `surfaceAt` on its own gives you, and the control the check
 * above needs. */
function steepestSurface(seed: number, dial: number): number {
  const g =
    dial === 0
      ? bareRock(seed)
      : createGeology(seed, resolveKnobs({ biome: "desert", dunes: dial }));
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
    //
    // Over a SPREAD of seeds, not a pair. Where the sand stands steepest is
    // a fact about where one seed put its ergs, and two seeds is not a
    // sample: the worst of the twenty below is seed 16, which the old pair
    // never looked at.
    //
    // The spread is spent at the TOP of the dial, because that is where the
    // sand stands steepest: `spread` grows the period more slowly than the
    // height, so each step up the dial is a steeper field. The lower stops
    // are walked on a few seeds each rather than all twenty — the same
    // question, an order of magnitude cheaper to keep asking.
    //
    // Not asserted as a monotone ladder in the dial, though it nearly is:
    // the erg MASK is rescaled by the same growth as the period, so the
    // steepest point in the country is not the same point at two dial
    // positions, and on some seeds a lower stop finds a slightly worse one.
    // Repose is the rule; the ordering is not.
    for (let seed = 1; seed <= 20; seed++) {
      expect(steepestSand(seed, 1)).toBeLessThan(0.67);
    }
    for (const dial of [0.22, 0.6]) {
      for (const seed of [1, 2, 16]) {
        expect(steepestSand(seed, dial)).toBeLessThan(0.67);
      }
    }
  });

  it("measures the SAND against repose, and not the rock it lies on", () => {
    // The guard on the check above. Repose is a rule about a material, so
    // the walk has to be over that material's own surface — and the easiest
    // way to get this wrong is to read `surfaceAt` and call the answer
    // sand. The bare desert is already at three quarters of the ceiling
    // before the wind has put anything on it, so a check that drifted back
    // to the whole surface would be mostly reporting geology, and would go
    // red for a country that had done nothing wrong.
    const rock = Math.max(...[1, 2, 16].map((seed) => steepestSurface(seed, 0)));
    expect(rock).toBeGreaterThan(0.4);
    expect(rock).toBeLessThan(0.67);
    // ...and the trap itself, stated as the fact that makes it a trap: at
    // the top of the dial there is a seed whose WHOLE surface is past the
    // sand's ceiling while the sand on it is comfortably under. Read the
    // surface and this country is refused for a wall it has not built.
    const whole = steepestSurface(16, 1);
    const sand = steepestSand(16, 1);
    expect(whole).toBeGreaterThan(0.67);
    expect(sand).toBeLessThan(0.67 * 0.9);
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
