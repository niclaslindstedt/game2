// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SHAPE of a fold — the displacement field the renderer bends every
// mesh on a damaged car through (pwa/src/game/car-crumple.ts). It is pure
// arithmetic over a vertex's rest position, so the rules it exists for can
// be held here without a browser: a pristine ledger moves nothing, two
// copies of one point go to one place (the shell is non-indexed and
// flat-shaded, and a field that split them would split the skin), a crush
// folds the face it names and nothing behind the bulkhead, a fold deepens
// with the ledger and never spikes past what the ledger paid for.

import { describe, expect, it } from "vitest";

import { DAMAGE_ZONES, shearedParts, TUNING } from "@engine";

import {
  crumple,
  crushAt,
  FOLD,
  noise,
  rimOf,
  type CrumpleFrame,
  type CrumpleLedger,
} from "../pwa/src/game/car-crumple.ts";

/** A hatchback-sized box of a body: the field only needs its outline. */
const FRAME: CrumpleFrame = {
  rim: rimOf(boxShell()),
  halfWidth: 0.8,
  floorY: 0.3,
  beltY: 0.8,
  roofY: 1.4,
  noseZ: 1.9,
  tailZ: -1.9,
};

function boxShell(): number[] {
  const rest: number[] = [];
  for (let z = -1.9; z <= 1.9; z += 0.1) {
    for (const x of [-0.8, 0.8]) rest.push(x, 0.6, z);
  }
  for (let x = -0.8; x <= 0.8; x += 0.1) {
    for (const z of [-1.9, 1.9]) rest.push(x, 0.6, z);
  }
  return rest;
}

function ledger(zones: Partial<Record<number, number>> = {}, belly = 0, roof = 0): CrumpleLedger {
  return {
    zones: Array.from({ length: DAMAGE_ZONES }, (_, i) => zones[i] ?? 0),
    belly,
    roof,
  };
}

function bent(
  l: CrumpleLedger,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const out = { x: 0, y: 0, z: 0 };
  crumple(l, FRAME, x, y, z, out);
  return out;
}

describe("the crumple field", () => {
  it("leaves a pristine car exactly where it was", () => {
    for (const [x, y, z] of [
      [0, 0.9, 1.9],
      [0.8, 0.6, 0],
      [-0.5, 1.4, -1.2],
      [0.3, 0.3, 1.1],
    ]) {
      const p = bent(ledger(), x, y, z);
      expect(p.x).toBeCloseTo(x, 9);
      expect(p.y).toBeCloseTo(y, 9);
      expect(p.z).toBeCloseTo(z, 9);
    }
  });

  it("sends two copies of one point to one place, whatever the ledger", () => {
    const l = ledger({ 0: 0.3, 1: 0.2, 2: 0.4, 5: 0.1 }, 0.1, 0.2);
    for (const [x, y, z] of [
      [0.4, 0.85, 1.8],
      [0.8, 0.6, 0.3],
      [-0.1, 1.4, -0.4],
    ]) {
      const a = bent(l, x, y, z);
      const b = bent(l, x, y, z);
      expect(a).toEqual(b);
    }
  });

  it("is continuous — neighbouring points a hair apart stay a hair apart", () => {
    const l = ledger({ 0: 0.34, 7: 0.2, 1: 0.2, 2: 0.4 }, 0.1, 0.25);
    const step = 0.002;
    for (const [x, y, z] of [
      [0.2, 0.9, 1.85],
      [0.79, 0.6, 0.2],
      [0.5, 1.35, 0.4],
      [-0.6, 0.35, 1.5],
    ]) {
      const a = bent(l, x, y, z);
      for (const [dx, dy, dz] of [
        [step, 0, 0],
        [0, step, 0],
        [0, 0, step],
      ]) {
        const b = bent(l, x + dx, y + dy, z + dz);
        const moved = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        // Fifty times the step is a steep slope; a tear across the skin
        // would be metres.
        expect(moved).toBeLessThan(step * 50);
      }
    }
  });

  it("folds the nose back by the ledger's metres times FOLD, and not the tail", () => {
    const crush = 0.3;
    const l = ledger({ 0: crush });
    const nose = bent(l, 0, 0.9, 1.9);
    // The rim of a square hit goes back the whole fold (the tear and the
    // ripple are sideways to it), within the kink's own drop.
    expect(1.9 - nose.z).toBeGreaterThan(crush * FOLD * 0.9);
    expect(1.9 - nose.z).toBeLessThan(crush * FOLD * 1.1);
    // Behind the bulkhead nothing moves.
    const cabin = bent(l, 0, 0.9, 0.3);
    expect(cabin.z).toBeCloseTo(0.3, 6);
    const tail = bent(l, 0, 0.9, -1.9);
    expect(tail.z).toBeCloseTo(-1.9, 6);
  });

  it("dies out with depth: the bumper goes further than the bulkhead", () => {
    const l = ledger({ 0: 0.3 });
    const rim = 1.9 - bent(l, 0, 0.9, 1.9).z;
    const mid = 1.5 - bent(l, 0, 0.9, 1.5).z;
    const deep = 1.1 - bent(l, 0, 0.9, 1.1).z;
    expect(rim).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
  });

  it("deepens monotonically with the ledger", () => {
    let last = 0;
    for (let crush = 0; crush <= TUNING.collision.zoneMax; crush += 0.02) {
      const back = 1.9 - bent(ledger({ 0: crush }), 0, 0.9, 1.9).z;
      expect(back).toBeGreaterThanOrEqual(last - 1e-9);
      last = back;
    }
  });

  it("never throws a vertex further than the fold it was paid for", () => {
    const l = ledger({ 0: 0.4, 1: 0.4, 2: 0.4, 3: 0.4, 4: 0.4, 5: 0.4, 6: 0.4, 7: 0.4 });
    let worst = 0;
    for (let z = -1.9; z <= 1.9; z += 0.05) {
      for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) {
        for (const y of [0.3, 0.6, 0.9, 1.2]) {
          const p = bent(l, x, y, z);
          worst = Math.max(worst, Math.hypot(p.x - x, p.y - y, p.z - z));
        }
      }
    }
    // The fold plus its bulge, ripple and tear, plus a kinked section's
    // own swing: a bounded multiple of the ledger's metre, never a spike.
    expect(worst).toBeLessThan(0.4 * FOLD * 1.8);
  });

  it("kinks the nose toward the corner that took the hit", () => {
    // The engine's right is +x, and zone 1 is the front-right corner.
    const right = bent(ledger({ 1: 0.35 }), 0, 0.9, 1.9);
    const left = bent(ledger({ 7: 0.35 }), 0, 0.9, 1.9);
    expect(right.x).toBeGreaterThan(0.05);
    expect(left.x).toBeLessThan(-0.05);
    // ...and a square one drops it.
    const square = bent(ledger({ 0: 0.35 }), 0, 0.9, 1.9);
    expect(square.y).toBeLessThan(0.9);
  });

  it("caves the roof and leaves the waist alone; sags the belly and leaves the roof alone", () => {
    const roof = bent(ledger({}, 0, 0.25), 0.3, 1.4, 0);
    expect(roof.y).toBeLessThan(1.4 - 0.15);
    const waist = bent(ledger({}, 0, 0.25), 0.8, 0.8, 0);
    expect(waist.y).toBeCloseTo(0.8, 6);
    const sill = bent(ledger({}, 0.2, 0), 0.8, 0.3, 0);
    expect(sill.y).toBeLessThan(0.3);
    const top = bent(ledger({}, 0.2, 0), 0.3, 1.4, 0);
    expect(top.y).toBeCloseTo(1.4, 6);
  });

  it("folds a flank into a trunk's V — deep at the zone's centre, gone between zones", () => {
    const zones = ledger({ 2: 0.3 }).zones;
    // The peaked kernel is the linear blend at a zone's own centre...
    expect(crushAt(zones, Math.PI / 2, 2.6)).toBeCloseTo(crushAt(zones, Math.PI / 2, 1));
    // ...and well under it halfway to the next: that is the V.
    const between = Math.PI / 2 + Math.PI / 8;
    expect(crushAt(zones, between, 2.6)).toBeLessThan(crushAt(zones, between, 1) * 0.4);
    // On the body it is deepest at the belt line and shallower at the sill
    // and the roof rail, which is where a trunk meets a door.
    const l = ledger({ 2: 0.3 });
    const belt = 0.8 - bent(l, 0.8, 0.8, 0).x;
    const sill = 0.8 - bent(l, 0.8, 0.3, 0).x;
    const rail = 0.8 - bent(l, 0.8, 1.4, 0).x;
    expect(belt).toBeGreaterThan(0.15);
    expect(sill).toBeLessThan(belt);
    expect(rail).toBeLessThan(belt);
  });

  it("wraps the car round a trunk in its flank: both ends come toward the hit", () => {
    const right = ledger({ 2: 0.3 });
    expect(bent(right, 0, 0.9, 1.9).x).toBeGreaterThan(0.05);
    expect(bent(right, 0, 0.9, -1.9).x).toBeGreaterThan(0.05);
    const left = ledger({ 6: 0.3 });
    expect(bent(left, 0, 0.9, 1.9).x).toBeLessThan(-0.05);
    expect(bent(left, 0, 0.9, -1.9).x).toBeLessThan(-0.05);
  });

  it("blends the crush between the two nearest zones round a corner", () => {
    const zones = ledger({ 0: 0.4 }).zones;
    expect(crushAt(zones, 0)).toBeCloseTo(0.4);
    expect(crushAt(zones, Math.PI / 8)).toBeCloseTo(0.2);
    expect(crushAt(zones, Math.PI / 4)).toBeCloseTo(0);
    expect(crushAt(zones, -Math.PI / 8)).toBeCloseTo(0.2);
  });

  it("noise is bounded and continuous", () => {
    let last = noise(0, 0, 0);
    for (let t = 0; t < 5; t += 0.01) {
      const v = noise(t * 1.3, t * 0.7, t * 2.1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - last)).toBeLessThan(0.1);
      last = v;
    }
  });
});

describe("the parts a hand-written ledger has sheared", () => {
  it("agrees with the bolts collision.ts tears parts off at", () => {
    const at = TUNING.collision.partAt;
    const base = {
      belly: 0,
      roof: 0,
      wear: 0,
      systems: { engine: 0, cooling: 0, suspension: 0, gearbox: 0, steering: 0, brakes: 0 },
      wheels: [0, 0, 0, 0],
      broken: [],
      version: 0,
    };
    const zones = (z: Partial<Record<number, number>>): number[] =>
      Array.from({ length: DAMAGE_ZONES }, (_, i) => z[i] ?? 0);
    // A right-corner fold just past the lamp's bolt takes that lamp, and the
    // mirror hung off the same corner, whose bolt is weaker still.
    expect(shearedParts({ ...base, zones: zones({ 1: at.lamp }) }).sort()).toEqual(
      ["lampFR", "mirrorR"].sort(),
    );
    // A square nose past the bumper's takes both lamps and the bumper.
    expect(shearedParts({ ...base, zones: zones({ 0: at.bumper }) }).sort()).toEqual(
      ["bumperF", "lampFL", "lampFR"].sort(),
    );
    // A roof past its glass line takes every pane, and a wheel at 1 is off.
    const rolled = shearedParts({
      ...base,
      zones: zones({}),
      roof: at.roofGlass,
      wheels: [0, 1, 0, 0],
    });
    expect(rolled).toEqual(
      expect.arrayContaining(["glassF", "glassB", "glassL", "glassR", "wheelFR"]),
    );
    expect(rolled).not.toContain("hood");
  });
});
