// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R45 — THE GRID: the transmission line laid rim to rim across the country,
// and the towers spotted along it.
//
// What these assertions hold up is the half of the feature that is a
// SURVEY rather than a drawing — and every one of them is a rule this
// session watched break at least once:
//
//   THE COUNTRY DECIDES WHETHER THERE IS ONE. A biome that makes no power
//   carries no grid, and a synthetic rig carries nothing at all.
//
//   THE TOWERS ARE THE LINE. Every span is inside the band the tension was
//   designed for, the line turns only by what a tower carries, and a tower
//   that carries a real turn is an ANGLE tower.
//
//   THERE IS AIR UNDER IT. Measured against the ground the CAR drives, not
//   against the country the survey read — the gap between those two is
//   where every clearance defect on this feature has come from.
//
//   IT CROSSES. Both ends outside the country a player can see; a line that
//   stops in a field is worse than no line.
//
//   IT IS THE SAME LINE EVERY TIME. A stage is a pure function of its seed,
//   and a grid drawn from a clock would take the daily stage with it.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compileStage,
  compileTrack,
  createTerrain,
  pylonLegs,
  spanSag,
  STAGE_RULES,
  underWayleave,
  type PowerLine,
  type Track,
} from "@engine";

const P = STAGE_RULES.powerline;

const tracks = new Map<number, Track>();
function stage(seed: number): Track {
  const had = tracks.get(seed);
  if (had) return had;
  const built = compileStage(seed, "medium");
  tracks.set(seed, built);
  return built;
}

/** Seeds whose country carries a line, found by SWEEPING — never a pinned
 * seed. Any change to the rules re-rolls the search, so "seed 3 has a power
 * line on it" is a fact about the country rather than about the thing under
 * test, and a suite that names one fails on every generator change with a
 * message about the wrong subject. Cached as SEEDS, not as tracks: callers
 * mutate what they are handed. */
const wired: number[] = [];
function wiredSeeds(want = 4): number[] {
  for (let seed = 1; wired.length < want && seed <= 60; seed++) {
    if (wired.includes(seed)) continue;
    if (stage(seed).powerLines.length > 0) wired.push(seed);
  }
  if (wired.length === 0) throw new Error("no seed in 1..60 carries a transmission line");
  return wired.slice(0, want);
}

describe("R45 — the grid", () => {
  it("is carried by a country that makes power, and by no other", () => {
    let taiga = 0;
    for (let seed = 1; seed <= 24; seed++) {
      if (stage(seed).powerLines.length > 0) taiga++;
      // R40 — the desert has no grid to feed, which is the same flag the
      // wind and solar farms read.
      const desert = compileStage(seed, "short", { biome: "desert" });
      expect(desert.powerLines).toHaveLength(0);
    }
    // A landmark, not wallpaper: some seeds and nothing like all of them.
    expect(taiga).toBeGreaterThan(2);
    expect(taiga).toBeLessThan(20);
  });

  it("carries at most one line, of one make of tower", () => {
    for (const seed of wiredSeeds()) {
      const track = stage(seed);
      expect(track.powerLines).toHaveLength(1);
      const line = track.powerLines[0];
      expect(line.height).toBeGreaterThanOrEqual(P.tower.height.min);
      expect(line.height).toBeLessThanOrEqual(P.tower.height.max);
      expect(line.pylons.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("spans only what the line's own tension was designed for", () => {
    for (const seed of wiredSeeds()) {
      const line = stage(seed).powerLines[0];
      for (const pylon of line.pylons.slice(1)) {
        expect(pylon.span).toBeGreaterThanOrEqual(P.span.min - 1);
        expect(pylon.span).toBeLessThanOrEqual(P.span.stretch + 1);
      }
    }
  });

  it("turns only at a tower, and only by what that tower carries", () => {
    let angled = 0;
    for (const seed of wiredSeeds()) {
      const line = stage(seed).powerLines[0];
      for (let i = 0; i + 1 < line.pylons.length; i++) {
        const a = line.pylons[i];
        const b = line.pylons[i + 1];
        // The bearing the span actually runs on, against the bearing the
        // tower it left says it left on. A line that bent between two
        // towers would show up here and nowhere else.
        const run = Math.atan2(b.x - a.x, b.z - a.z);
        const along = a.heading + a.deviation / 2;
        expect(Math.abs(Math.sin(run - along))).toBeLessThan(0.02);
        expect(Math.abs(a.deviation)).toBeLessThanOrEqual(P.angle.most + 1e-6);
        if (a.kind === "angle") {
          angled++;
          expect(Math.abs(a.deviation)).toBeGreaterThan(P.angle.suspension);
        } else {
          // A suspension tower carries a couple of degrees and no more.
          expect(Math.abs(a.deviation)).toBeLessThanOrEqual(P.angle.suspension + 1e-9);
        }
      }
    }
    // A line with no angle tower on it anywhere is a ruled line, which is
    // the thing the survey's own angle points exist to prevent.
    expect(angled).toBeGreaterThan(0);
  });

  it("keeps its conductors clear of the ground the car drives", () => {
    for (const seed of wiredSeeds(3)) {
      const track = stage(seed);
      const terrain = createTerrain(track);
      terrain.sync(0);
      const line = track.powerLines[0];
      const foot = (p: PowerLine["pylons"][number]): number =>
        Math.max(...pylonLegs(p).map((leg) => terrain.groundAt(leg.x, leg.z)));
      for (let i = 0; i + 1 < line.pylons.length; i++) {
        const a = line.pylons[i];
        const b = line.pylons[i + 1];
        const ay = foot(a) + line.height - P.wire.insulator;
        const by = foot(b) + line.height - P.wire.insulator;
        for (let k = 1; k < 12; k++) {
          const t = k / 12;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const wire = ay + (by - ay) * t - spanSag(b.span, t);
          expect(wire - terrain.groundAt(x, z)).toBeGreaterThan(0);
        }
      }
    }
  });

  it("stands every tower out of the water and off the road", () => {
    for (const seed of wiredSeeds(3)) {
      const track = stage(seed);
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const pylon of track.powerLines[0].pylons) {
        for (const leg of pylonLegs(pylon)) {
          expect(terrain.waterAt(leg.x, leg.z)).toBeNull();
        }
        expect(terrain.roadDistanceAt(pylon.x, pylon.z)).toBeGreaterThan(track.width / 2);
      }
    }
  });

  it("crosses the whole country and ends outside it", () => {
    for (const seed of wiredSeeds()) {
      const track = stage(seed);
      const line = track.powerLines[0];
      const b = track.bounds;
      for (const end of [line.pylons[0], line.pylons[line.pylons.length - 1]]) {
        const outside = end.x < b.minX || end.x > b.maxX || end.z < b.minZ || end.z > b.maxZ;
        expect(outside).toBe(true);
      }
    }
  });

  it("cuts a wayleave the width the rule says, and only along the spans", () => {
    const line = stage(wiredSeeds(1)[0]).powerLines[0];
    const a = line.pylons[0];
    const b = line.pylons[1];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const nx = -(b.z - a.z) / b.span;
    const nz = (b.x - a.x) / b.span;
    expect(underWayleave(line, mx, mz)).toBe(true);
    expect(underWayleave(line, mx + nx * (P.wayleave - 1), mz + nz * (P.wayleave - 1))).toBe(true);
    expect(underWayleave(line, mx + nx * (P.wayleave + 2), mz + nz * (P.wayleave + 2))).toBe(false);
    // ...and nowhere near the line at all.
    expect(underWayleave(line, mx + nx * 4000, mz + nz * 4000)).toBe(false);
  });

  it("sags as the square of the span, and hangs nothing at its towers", () => {
    expect(spanSag(400, 0)).toBeCloseTo(0, 6);
    expect(spanSag(400, 1)).toBeCloseTo(0, 6);
    // Twice the span is four times the sag: it is `w·L²/8H` at one tension,
    // and it is the reason a long crossing span needs a valley under it.
    expect(spanSag(600, 0.5) / spanSag(300, 0.5)).toBeCloseTo(4, 6);
    // The ruling span hangs the share of itself the rule says.
    expect(spanSag(P.span.ruling, 0.5)).toBeCloseTo(P.sag * P.span.ruling, 6);
  });

  it("draws the map's corridor at the width the forest is kept off", () => {
    // `make level` RESTATES the wayleave and the crossarm, because that
    // module is loaded before its own entry point registers the `@engine`
    // alias and so cannot import the rule. A restated number is only safe
    // while something holds the pair — and it is read out of the SOURCE
    // rather than imported, because a plain `.mjs` under `scripts/` carries
    // no types and the import alone fails the typecheck.
    const source = readFileSync(
      new URL("../scripts/lib/level-map-render.mjs", import.meta.url),
      "utf8",
    );
    const stated = (name: string): number => {
      const found = source.match(new RegExp(`export const ${name} = (-?[\\d.]+);`));
      if (!found) throw new Error(`level-map-render.mjs no longer states ${name}`);
      return Number(found[1]);
    };
    expect(stated("WAYLEAVE")).toBe(P.wayleave);
    expect(stated("ARM")).toBe(P.tower.arm);
  });

  it("is the same line every time the same seed is built", () => {
    const seed = wiredSeeds(1)[0];
    const once = compileStage(seed, "medium").powerLines[0];
    const twice = compileStage(seed, "medium").powerLines[0];
    expect(twice.height).toBe(once.height);
    expect(twice.pylons).toEqual(once.pylons);
  });

  it("stands nothing on a synthetic rig", () => {
    // A rig is a measuring device, and a tower beside a drift test's
    // straight is a wall the car under test slides into. The same line
    // every other piece of the landscape draws on one.
    const rig = compileTrack(7, [
      { kind: "straight", length: 600, feature: "none" },
      { kind: "turn", length: 200, radius: 90, dir: 1, feature: "none" },
      { kind: "straight", length: 600, feature: "none" },
    ]);
    expect(rig.powerLines).toHaveLength(0);
  });
});
